import type { UserRole } from "@shared/types/index";

/** Roles that can send listing recommendations to connected clients. Mirrors `/api/recommendations` POST. */
export function canSendRecommendations(role: UserRole | null | undefined): boolean {
  return role === "advisor" || role === "agent" || role === "admin";
}

/** Roles that can sit on the professional side of an advisor connection. Mirrors `/api/admin` connections. */
export function isConnectionProfessional(role: UserRole | null | undefined): boolean {
  return canSendRecommendations(role);
}
