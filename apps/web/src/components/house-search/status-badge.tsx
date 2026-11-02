import type { HouseSearchStatus } from "@shared/types/house-search";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";

const STYLE: Record<HouseSearchStatus, string> = {
  interested: "bg-brand-soft text-brand-text",
  visited: "bg-success-soft text-success-text",
  rejected: "bg-unknown-soft text-ink-soft",
};

export function StatusBadge({ status }: { status: HouseSearchStatus }) {
  const { t } = useI18n();
  return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STYLE[status]}`}>{t(`hs.status.${status}` as TranslationKey)}</span>;
}
