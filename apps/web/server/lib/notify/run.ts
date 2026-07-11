import type { SupabaseClient } from "@supabase/supabase-js";
import type { AlertFrequency } from "../../../../../packages/shared/src/types/index.js";
import { searchProperties } from "../search.js";
import { getAuthAdmin } from "../supabase.js";
import { sendAlertEmail } from "./email.js";
import { logError, logEvent } from "../crawl/log.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const CADENCE_MS: Record<Exclude<AlertFrequency, "none">, number> = {
  // GitHub Actions cron in this repo runs at most daily; "immediate" means
  // "next daily notify run after a match appears," not literally real time.
  immediate: 0,
  daily: DAY_MS,
  weekly: 7 * DAY_MS,
};

export interface NotifySearchReport {
  searchId: string;
  matched: number;
  emailed: boolean;
  error?: string;
}

export interface NotifyResult {
  ok: boolean;
  due: number;
  reports: NotifySearchReport[];
}

function isDue(alertFrequency: AlertFrequency, lastAlertAt: string | null): boolean {
  if (alertFrequency === "none") return false;
  if (!lastAlertAt) return true;
  const cadence = CADENCE_MS[alertFrequency];
  return Date.now() - new Date(lastAlertAt).getTime() >= cadence;
}

/**
 * For each saved search whose alert cadence is due, matches newly-created
 * listings against its filters, records an alerts + notifications row, and
 * emails the owner. Triggered by /api/notify (see .github/workflows/notify.yml).
 */
export async function runNotify(client: SupabaseClient): Promise<NotifyResult> {
  const { data: searches, error } = await client
    .from("searches")
    .select("*")
    .neq("alert_frequency", "none");
  if (error) {
    logError("notify.load_searches_failed", error);
    return { ok: false, due: 0, reports: [] };
  }

  const due = (searches ?? []).filter((s) => isDue(s.alert_frequency, s.last_alert_at));
  const reports: NotifySearchReport[] = [];

  for (const search of due) {
    const report: NotifySearchReport = { searchId: search.id, matched: 0, emailed: false };
    try {
      const createdAfter = search.last_alert_at ?? search.created_at;
      const result = await searchProperties(
        client,
        { ...search.filters, createdAfter, limit: 100 },
        true,
      );
      report.matched = result.properties.length;

      if (result.properties.length > 0) {
        const { data: alert, error: alertError } = await client
          .from("alerts")
          .insert({
            search_id: search.id,
            property_ids: result.properties.map((p) => p.id),
            email_status: "pending",
          })
          .select("*")
          .single();
        if (alertError || !alert) throw alertError ?? new Error("Failed to insert alert row");

        const { error: notificationsError } = await client.from("notifications").upsert(
          result.properties.map((p) => ({
            user_id: search.user_id,
            search_id: search.id,
            property_id: p.id,
            alert_id: alert.id,
          })),
          { onConflict: "search_id,property_id", ignoreDuplicates: true },
        );
        if (notificationsError) logError("notify.notifications_insert_failed", notificationsError, { searchId: search.id });

        try {
          const { data: authUser } = await getAuthAdmin(client).getUserById(search.user_id);
          const email = authUser?.user?.email;
          if (!email) throw new Error("No email on file for user");
          await sendAlertEmail(email, search.name, result.properties);
          await client.from("alerts").update({ email_status: "sent" }).eq("id", alert.id);
          report.emailed = true;
        } catch (emailErr) {
          await client.from("alerts").update({ email_status: "failed" }).eq("id", alert.id);
          logError("notify.email_failed", emailErr, { searchId: search.id });
          report.error = emailErr instanceof Error ? emailErr.message : String(emailErr);
        }
      }

      await client
        .from("searches")
        .update({ last_alert_at: new Date().toISOString() })
        .eq("id", search.id);
    } catch (err) {
      logError("notify.search_failed", err, { searchId: search.id });
      report.error = err instanceof Error ? err.message : String(err);
    }
    reports.push(report);
  }

  logEvent("notify.done", { due: due.length, emailed: reports.filter((r) => r.emailed).length });
  return { ok: true, due: due.length, reports };
}
