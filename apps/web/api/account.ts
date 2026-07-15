import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationWithContext, UserRole } from "../../../packages/shared/src/types/index.js";
import type {
  CreateConversationBody,
  MyConnection,
  SendMessageBody,
  UpdateProfileBody,
} from "../../../packages/shared/src/types/api.js";
import { applyCors } from "../server/middleware/cors.js";
import { requireUser } from "../server/middleware/auth.js";
import { getAnonClient, getAuthAdmin, getServiceRoleClient } from "../server/lib/supabase.js";
import { isUuid, sendError } from "../server/lib/http-helpers.js";
import { rowToConversation, rowToMessage, rowToProfile } from "../server/lib/row-mappers.js";

function str(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : (v as string | undefined);
}

/**
 * Consolidated router for the signed-in-user account area (messaging,
 * personal info/preferences, and the caller's own advisor/agent<->customer
 * connections), following the same ?resource= sub-routing as
 * admin.ts/notifications.ts to stay under Vercel's serverless function
 * count limit — the project was already at exactly 12 API functions before
 * `connections` was folded in here too, so this deliberately consolidates
 * several related-but-distinct resources into one file rather than adding
 * more.
 *
 *   GET  /api/account?resource=conversations
 *   POST /api/account?resource=conversations
 *   GET  /api/account?resource=thread&conversationId=:id  (also marks read)
 *   POST /api/account?resource=thread&conversationId=:id
 *   GET  /api/account?resource=profile
 *   PATCH /api/account?resource=profile
 *   GET  /api/account?resource=connections
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;

  const auth = await requireUser(req, res);
  if (!auth) return;
  const client = getAnonClient(auth.jwt);
  res.setHeader("Cache-Control", "no-store");

  const resource = str(req.query.resource);
  switch (resource) {
    case "conversations":
      await handleConversations(req, res, client, auth.userId);
      return;
    case "thread":
      await handleThread(req, res, client, auth.userId);
      return;
    case "profile":
      await handleProfile(req, res, client, auth.userId);
      return;
    case "connections":
      await handleConnections(req, res, auth.userId);
      return;
  }
  res.status(404).json({ error: "Not found" });
}

/**
 * GET /api/account?resource=connections — the caller's own advisor/agent<->
 * customer connections, from whichever side they're on, with the other
 * party's email and role resolved so the frontend can show a real contact
 * card instead of a bare UUID.
 *
 * advisor_connections rows are already readable by either party via RLS
 * (advisor_connections_select_party), but emails live in auth.users, which
 * PostgREST doesn't expose to the anon client — hence the service-role
 * lookup here. To avoid turning that into a privilege escalation, the query
 * is manually scoped to rows where the caller is advisor_id or user_id;
 * nothing here lets a caller see connections they aren't a party to.
 */
async function handleConnections(req: VercelRequest, res: VercelResponse, userId: string) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let serviceClient: SupabaseClient;
  try {
    serviceClient = getServiceRoleClient();
  } catch (err) {
    sendError(res, 500, "Account API is not configured (missing service role credentials)", err);
    return;
  }

  const { data, error } = await serviceClient
    .from("advisor_connections")
    .select("*")
    .or(`advisor_id.eq.${userId},user_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) {
    sendError(res, 500, "Failed to load connections", error);
    return;
  }
  const rows = (data ?? []) as Record<string, any>[];

  const otherIds: string[] = Array.from(
    new Set(rows.map((row) => (row.advisor_id === userId ? row.user_id : row.advisor_id) as string)),
  );
  if (otherIds.length === 0) {
    res.status(200).json({ connections: [] });
    return;
  }

  const [{ data: profilesData, error: profilesError }, authUsers] = await Promise.all([
    serviceClient.from("user_profiles").select("*").in("id", otherIds),
    Promise.all(otherIds.map((id) => getAuthAdmin(serviceClient).getUserById(id))),
  ]);
  if (profilesError) {
    sendError(res, 500, "Failed to load connection details", profilesError);
    return;
  }
  const profiles = (profilesData ?? []) as Record<string, any>[];

  const emailById = new Map(otherIds.map((id, i) => [id, authUsers[i]?.data.user?.email ?? ""]));
  const profileById = new Map(profiles.map((p) => [p.id as string, p]));

  const connections: MyConnection[] = rows.map((row) => {
    const isCallerAdvisor = row.advisor_id === userId;
    const otherUserId: string = isCallerAdvisor ? row.user_id : row.advisor_id;
    const otherProfile = profileById.get(otherUserId);
    return {
      id: row.id,
      direction: isCallerAdvisor ? "client" : "professional",
      otherUserId,
      otherUserEmail: emailById.get(otherUserId) ?? "",
      otherUserRole: otherProfile?.role ?? "user",
      otherUserOrganizationName: otherProfile?.organization_name ?? null,
      createdAt: row.created_at,
    };
  });

  res.status(200).json({ connections });
}

async function handleProfile(req: VercelRequest, res: VercelResponse, client: SupabaseClient, userId: string) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.method === "PATCH") {
    const body = req.body as UpdateProfileBody;
    // Explicit allowlist — role/organizationName are admin-managed only
    // (also enforced at the DB layer by the user_profiles privilege-
    // escalation trigger, but the API never even attempts to pass them
    // through).
    const update: Record<string, unknown> = {};
    if (body.fullName !== undefined) update.full_name = body.fullName;
    if (body.phone !== undefined) update.phone = body.phone;
    if (body.contactPref !== undefined) update.contact_pref = body.contactPref;
    if (body.bestTime !== undefined) update.best_time = body.bestTime;
    if (body.notificationChannels !== undefined) update.notification_channels = body.notificationChannels;
    if (body.licenseNumber !== undefined) update.license_number = body.licenseNumber;
    if (body.leadRouting !== undefined) update.lead_routing = body.leadRouting;
    if (body.notifyNewLead !== undefined) update.notify_new_lead = body.notifyNewLead;

    if (Object.keys(update).length > 0) {
      const { error } = await client.from("user_profiles").update(update).eq("id", userId);
      if (error) {
        sendError(res, 500, "Failed to update profile", error);
        return;
      }
    }
  }

  const { data, error } = await client.from("user_profiles").select("*").eq("id", userId).single();
  if (error || !data) {
    sendError(res, 404, "Profile not found", error ?? undefined);
    return;
  }

  let email = "";
  try {
    const serviceClient = getServiceRoleClient();
    const { data: authUser } = await getAuthAdmin(serviceClient).getUserById(userId);
    email = authUser?.user?.email ?? "";
  } catch {
    // Email is a nice-to-have display field; profile data itself still returns.
  }

  res.status(200).json({ profile: rowToProfile(data), email });
}

async function handleConversations(
  req: VercelRequest,
  res: VercelResponse,
  client: SupabaseClient,
  userId: string,
) {
  if (req.method === "GET") {
    const { data: rows, error } = await client
      .from("conversations")
      .select("*")
      .or(`advisor_id.eq.${userId},user_id.eq.${userId}`)
      .order("created_at", { ascending: false });
    if (error) {
      sendError(res, 500, "Failed to load conversations", error);
      return;
    }
    const conversations = rows ?? [];
    if (conversations.length === 0) {
      res.status(200).json({ conversations: [] });
      return;
    }

    const counterpartIds = Array.from(
      new Set(conversations.map((c) => (c.advisor_id === userId ? c.user_id : c.advisor_id) as string)),
    );
    const propertyIds = Array.from(
      new Set(conversations.map((c) => c.property_id as string | null).filter((id): id is string => !!id)),
    );
    const conversationIds = conversations.map((c) => c.id as string);

    let serviceClient: SupabaseClient;
    try {
      serviceClient = getServiceRoleClient();
    } catch (err) {
      sendError(res, 500, "Account API is not configured (missing service role credentials)", err);
      return;
    }

    const [profilesResult, propertiesResult, lastMessagesResult, authUsers] = await Promise.all([
      client.from("user_profiles").select("id, role, organization_name").in("id", counterpartIds),
      propertyIds.length > 0
        ? client.from("properties").select("id, address").in("id", propertyIds)
        : Promise.resolve({ data: [], error: null }),
      client
        .from("messages")
        .select("*")
        .in("conversation_id", conversationIds)
        .order("created_at", { ascending: false }),
      Promise.all(counterpartIds.map((id) => getAuthAdmin(serviceClient).getUserById(id))),
    ]);
    if (profilesResult.error || propertiesResult.error || lastMessagesResult.error) {
      sendError(
        res,
        500,
        "Failed to load conversation details",
        profilesResult.error ?? propertiesResult.error ?? lastMessagesResult.error,
      );
      return;
    }

    const roleById = new Map(profilesResult.data.map((p) => [p.id as string, p.role as UserRole]));
    const orgById = new Map(profilesResult.data.map((p) => [p.id as string, p.organization_name as string | null]));
    const emailById = new Map(counterpartIds.map((id, i) => [id, authUsers[i]?.data.user?.email ?? ""]));
    const addressById = new Map((propertiesResult.data ?? []).map((p) => [p.id as string, p.address as string]));
    const lastMessageByConversation = new Map<string, (typeof lastMessagesResult.data)[number]>();
    for (const message of lastMessagesResult.data ?? []) {
      if (!lastMessageByConversation.has(message.conversation_id as string)) {
        lastMessageByConversation.set(message.conversation_id as string, message);
      }
    }

    const result: ConversationWithContext[] = conversations.map((row) => {
      const base = rowToConversation(row);
      const isCallerAdvisor = row.advisor_id === userId;
      const counterpartId = isCallerAdvisor ? row.user_id : row.advisor_id;
      const myLastRead = isCallerAdvisor ? row.advisor_last_read_at : row.user_last_read_at;
      const lastMessageRow = lastMessageByConversation.get(row.id as string);
      const lastMessage = lastMessageRow ? rowToMessage(lastMessageRow) : null;
      const unread = !!lastMessage && lastMessage.senderId !== userId
        && (!myLastRead || new Date(lastMessage.createdAt) > new Date(myLastRead));
      return {
        ...base,
        counterpartId,
        counterpartName: orgById.get(counterpartId) || emailById.get(counterpartId) || "",
        counterpartRole: roleById.get(counterpartId) ?? "user",
        propertyAddress: row.property_id ? addressById.get(row.property_id) ?? null : null,
        lastMessage,
        unread,
      };
    });

    res.status(200).json({ conversations: result });
    return;
  }

  if (req.method === "POST") {
    const body = req.body as CreateConversationBody;
    if (!body?.otherUserId) {
      res.status(400).json({ error: "otherUserId is required" });
      return;
    }
    const { data: otherProfile, error: profileError } = await client
      .from("user_profiles")
      .select("role")
      .eq("id", body.otherUserId)
      .single();
    if (profileError || !otherProfile) {
      sendError(res, 404, "The other user was not found", profileError ?? undefined);
      return;
    }
    // Whichever party is the professional (agent/advisor) is stored as
    // advisor_id, mirroring advisor_connections — the caller may be either.
    const isOtherProfessional = otherProfile.role === "agent" || otherProfile.role === "advisor";
    const advisorId = isOtherProfessional ? body.otherUserId : userId;
    const buyerId = isOtherProfessional ? userId : body.otherUserId;

    const { data, error } = await client
      .from("conversations")
      .insert({ advisor_id: advisorId, user_id: buyerId, property_id: body.propertyId ?? null })
      .select("*")
      .single();
    if (error || !data) {
      if (error?.code === "23505") {
        // Already exists — return the existing thread instead of erroring.
        let existingQuery = client.from("conversations").select("*").eq("advisor_id", advisorId).eq("user_id", buyerId);
        existingQuery = body.propertyId
          ? existingQuery.eq("property_id", body.propertyId)
          : existingQuery.is("property_id", null);
        const { data: existing } = await existingQuery.single();
        if (existing) {
          res.status(200).json(rowToConversation(existing));
          return;
        }
      }
      sendError(res, 400, "Failed to start conversation (are you connected with this user?)", error ?? undefined);
      return;
    }
    res.status(201).json(rowToConversation(data));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

async function handleThread(
  req: VercelRequest,
  res: VercelResponse,
  client: SupabaseClient,
  userId: string,
) {
  const conversationId = str(req.query.conversationId);
  if (!isUuid(conversationId)) {
    sendError(res, 400, "Invalid conversation id");
    return;
  }

  const { data: conversation, error: conversationError } = await client
    .from("conversations")
    .select("*")
    .eq("id", conversationId)
    .single();
  if (conversationError || !conversation) {
    sendError(res, 404, "Conversation not found", conversationError ?? undefined);
    return;
  }

  if (req.method === "GET") {
    const { data, error } = await client
      .from("messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) {
      sendError(res, 500, "Failed to load messages", error);
      return;
    }
    // Opening a thread marks it read — bump only the caller's own marker.
    const isCallerAdvisor = conversation.advisor_id === userId;
    await client
      .from("conversations")
      .update(
        isCallerAdvisor
          ? { advisor_last_read_at: new Date().toISOString() }
          : { user_last_read_at: new Date().toISOString() },
      )
      .eq("id", conversationId);
    res.status(200).json({ messages: (data ?? []).map(rowToMessage) });
    return;
  }

  if (req.method === "POST") {
    const body = req.body as SendMessageBody;
    const text = body?.body?.trim();
    if (!text) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    const { data, error } = await client
      .from("messages")
      .insert({ conversation_id: conversationId, sender_id: userId, body: text })
      .select("*")
      .single();
    if (error || !data) {
      sendError(res, 500, "Failed to send message", error ?? undefined);
      return;
    }

    // Notify the recipient. Uses the service-role client since notifications
    // has no insert policy for authenticated callers (inserts are otherwise
    // service-role only, from the notify cron job) — the message insert
    // itself above already went through RLS on the caller's own JWT.
    const recipientId = conversation.advisor_id === userId ? conversation.user_id : conversation.advisor_id;
    try {
      const serviceClient = getServiceRoleClient();
      await serviceClient.from("notifications").insert({
        user_id: recipientId,
        type: "message",
        conversation_id: conversationId,
        title: "New message",
        body: text.slice(0, 200),
        link_path: `/account/messages?conversationId=${conversationId}`,
      });
    } catch {
      // Message already sent successfully; a missing notification isn't
      // worth failing the request over.
    }

    res.status(201).json(rowToMessage(data));
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
