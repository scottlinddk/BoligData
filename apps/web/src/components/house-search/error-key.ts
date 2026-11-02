import { HouseSearchError, type HouseSearchErrorCode } from "@/lib/house-search-rows";
import type { TranslationKey } from "@/i18n/translations";

const KEYS: Record<HouseSearchErrorCode, TranslationKey> = {
  duplicate: "hs.error.duplicate",
  invalidCode: "hs.error.invalidCode",
  householdFull: "hs.error.householdFull",
  alreadyMember: "hs.error.alreadyMember",
  unknown: "hs.error.unknown",
};

/** Translation key for any error thrown by the house-search data layer. Raw database messages are never shown. */
export function houseSearchErrorKey(error: unknown): TranslationKey {
  return error instanceof HouseSearchError ? KEYS[error.code] : KEYS.unknown;
}
