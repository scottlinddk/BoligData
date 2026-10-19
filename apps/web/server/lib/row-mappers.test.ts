import { describe, expect, it } from "vitest";
import { rowToConversation, rowToMessage, rowToNotification, rowToProfile } from "./row-mappers.js";

describe("rowToNotification", () => {
  it("maps a search-match notification (legacy shape)", () => {
    const result = rowToNotification({
      id: "n1",
      user_id: "u1",
      type: "new_listing",
      search_id: "s1",
      property_id: "p1",
      alert_id: "a1",
      conversation_id: null,
      title: null,
      body: null,
      link_path: null,
      read_at: null,
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result).toEqual({
      id: "n1",
      userId: "u1",
      type: "new_listing",
      searchId: "s1",
      propertyId: "p1",
      alertId: "a1",
      conversationId: null,
      title: null,
      body: null,
      linkPath: null,
      readAt: null,
      createdAt: "2026-01-01T00:00:00Z",
    });
  });

  it("maps a message notification with search/property null and conversation set", () => {
    const result = rowToNotification({
      id: "n2",
      user_id: "u1",
      type: "message",
      search_id: null,
      property_id: null,
      alert_id: null,
      conversation_id: "c1",
      title: "New message",
      body: "Hi there",
      link_path: "/account/messages?conversationId=c1",
      read_at: "2026-01-02T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result.searchId).toBeNull();
    expect(result.propertyId).toBeNull();
    expect(result.conversationId).toBe("c1");
    expect(result.readAt).toBe("2026-01-02T00:00:00Z");
  });
});

describe("rowToConversation", () => {
  it("maps snake_case columns to camelCase", () => {
    const result = rowToConversation({
      id: "c1",
      property_id: "p1",
      advisor_id: "adv1",
      user_id: "u1",
      created_at: "2026-01-01T00:00:00Z",
      advisor_last_read_at: null,
      user_last_read_at: "2026-01-02T00:00:00Z",
    });
    expect(result).toEqual({
      id: "c1",
      propertyId: "p1",
      advisorId: "adv1",
      userId: "u1",
      createdAt: "2026-01-01T00:00:00Z",
      advisorLastReadAt: null,
      userLastReadAt: "2026-01-02T00:00:00Z",
    });
  });
});

describe("rowToMessage", () => {
  it("maps snake_case columns to camelCase", () => {
    const result = rowToMessage({
      id: "m1",
      conversation_id: "c1",
      sender_id: "u1",
      body: "hello",
      created_at: "2026-01-01T00:00:00Z",
    });
    expect(result).toEqual({
      id: "m1",
      conversationId: "c1",
      senderId: "u1",
      body: "hello",
      createdAt: "2026-01-01T00:00:00Z",
    });
  });
});

describe("rowToProfile", () => {
  it("maps a full user_profiles row, including agent-only fields", () => {
    const result = rowToProfile({
      id: "u1",
      role: "agent",
      organization_name: "Acme Estate",
      created_at: "2026-01-01T00:00:00Z",
      full_name: "Jane Doe",
      phone: "+45 12345678",
      contact_pref: "email",
      best_time: "anytime",
      notification_channels: { new_listing: { email: true, push: false } },
      license_number: "LIC-1",
      lead_routing: "manual",
      notify_new_lead: false,
    });
    expect(result).toEqual({
      id: "u1",
      role: "agent",
      organizationName: "Acme Estate",
      createdAt: "2026-01-01T00:00:00Z",
      fullName: "Jane Doe",
      phone: "+45 12345678",
      contactPref: "email",
      bestTime: "anytime",
      notificationChannels: { new_listing: { email: true, push: false } },
      licenseNumber: "LIC-1",
      leadRouting: "manual",
      notifyNewLead: false,
    });
  });
});
