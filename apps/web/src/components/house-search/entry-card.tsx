import { useState } from "react";
import { Link } from "react-router-dom";
import { HOUSE_SEARCH_STATUSES, type HouseSearchEntry } from "@shared/types/house-search";
import { Field, buttonClass, inputClass, primaryClass } from "@/components/research/fields";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { formatDate, formatDkk } from "@/lib/house-search-format";
import type { EntryPatch } from "@/lib/house-search-rows";
import { parseEntryForm, type EntryErrors, type EntryFormValues } from "@/lib/house-search-schema";
import { houseSearchErrorKey } from "./error-key";
import { RatingInput } from "./rating-input";
import { StatusBadge } from "./status-badge";

interface EntryCardProps {
  entry: HouseSearchEntry;
  onEdit: (id: string, patch: EntryPatch) => Promise<unknown>;
  onDelete: (entry: HouseSearchEntry) => void;
  busy: boolean;
}

const toValues = (e: HouseSearchEntry): EntryFormValues => ({
  husnummerId: e.husnummerId,
  addressLabel: e.addressLabel,
  seenAt: e.seenAt,
  price: e.askingPriceDkk === null ? "" : String(e.askingPriceDkk),
  rooms: e.rooms === null ? "" : String(e.rooms),
  status: e.status,
  rating: e.rating === null ? "" : String(e.rating),
  notes: e.notes,
});

export function EntryCard({ entry, onEdit, onDelete, busy }: EntryCardProps) {
  const { t, language } = useI18n();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<EntryFormValues>(() => toValues(entry));
  const [errors, setErrors] = useState<EntryErrors>({});
  const [serverError, setServerError] = useState<TranslationKey | null>(null);
  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function save() {
    const parsed = parseEntryForm(values);
    if (!parsed.ok) return setErrors(parsed.errors);
    setErrors({});
    setServerError(null);
    const { seenAt, askingPriceDkk, rooms, status, rating, notes } = parsed.input;
    try {
      await onEdit(entry.id, { seenAt, askingPriceDkk, rooms, status, rating, notes });
      setEditing(false);
    } catch (error) {
      setServerError(houseSearchErrorKey(error));
    }
  }

  const err = (field: keyof EntryErrors) =>
    errors[field] ? <span role="alert" className="mt-1 block text-xs font-normal text-danger">{t(`hs.fieldError.${errors[field]}` as TranslationKey)}</span> : null;

  if (editing) {
    return (
      <li className="rounded-xl border border-brand bg-surface p-3 sm:p-4">
        <p className="mb-3 text-sm font-bold text-ink">{entry.addressLabel}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("hs.form.date")}>
            <input className={inputClass} type="date" value={values.seenAt} onChange={(e) => set("seenAt", e.target.value)} />
            {err("seenAt")}
          </Field>
          <Field label={t("hs.form.price")}>
            <input className={inputClass} inputMode="numeric" value={values.price} onChange={(e) => set("price", e.target.value)} />
            {err("price")}
          </Field>
          <Field label={t("hs.form.rooms")}>
            <input className={inputClass} inputMode="numeric" value={values.rooms} onChange={(e) => set("rooms", e.target.value)} />
            {err("rooms")}
          </Field>
          <Field label={t("hs.form.status")}>
            <select className={inputClass} value={values.status} onChange={(e) => set("status", e.target.value)}>
              {HOUSE_SEARCH_STATUSES.map((s) => <option key={s} value={s}>{t(`hs.status.${s}` as TranslationKey)}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <span className="block text-sm font-semibold text-ink-soft">{t("hs.form.rating")}</span>
            <RatingInput label={t("hs.form.rating")} value={values.rating ? Number(values.rating) : null} onChange={(v) => set("rating", v === null ? "" : String(v))} />
          </div>
          <div className="sm:col-span-2">
            <Field label={t("hs.form.notes")}>
              <textarea className={inputClass} rows={2} maxLength={2000} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
              {err("notes")}
            </Field>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className={primaryClass} disabled={busy} onClick={save}>{t("hs.list.save")}</button>
          <button type="button" className={buttonClass} disabled={busy} onClick={() => { setValues(toValues(entry)); setErrors({}); setServerError(null); setEditing(false); }}>{t("hs.list.cancel")}</button>
          {serverError && <span role="alert" className="text-sm text-danger">{t(serverError)}</span>}
        </div>
      </li>
    );
  }

  const located = entry.lat !== null && entry.lon !== null;
  return (
    <li className="rounded-xl border border-border bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/address/${entry.husnummerId}`} className="font-bold text-ink underline-offset-2 hover:underline">{entry.addressLabel}</Link>
          <p className="mt-0.5 text-xs text-ink-soft">{formatDate(entry.seenAt, language)}</p>
        </div>
        <StatusBadge status={entry.status} />
      </div>

      <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {entry.askingPriceDkk !== null && <div><dt className="sr-only">{t("hs.form.price")}</dt><dd className="font-semibold tabular-nums">{formatDkk(entry.askingPriceDkk, language)}</dd></div>}
        {entry.rooms !== null && <div><dt className="sr-only">{t("hs.form.rooms")}</dt><dd>{t("hs.list.rooms", { count: entry.rooms })}</dd></div>}
        {entry.rating !== null && <div><dt className="sr-only">{t("hs.form.rating")}</dt><dd>{t("hs.list.rated", { rating: entry.rating })}</dd></div>}
        {!located && <div><dd className="text-xs text-ink-soft">{t("hs.list.notOnMap")}</dd></div>}
      </dl>

      {entry.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{entry.notes}</p>}

      <div className="mt-3 flex gap-2">
        <button type="button" className={`${buttonClass} !px-3 !py-1 text-xs`} disabled={busy} onClick={() => { setValues(toValues(entry)); setEditing(true); }}>{t("hs.list.edit")}</button>
        <button
          type="button"
          className={`${buttonClass} !px-3 !py-1 text-xs text-danger`}
          disabled={busy}
          onClick={() => { if (window.confirm(t("hs.list.confirmDelete", { address: entry.addressLabel }))) onDelete(entry); }}
        >
          {t("hs.list.delete")}
        </button>
      </div>
    </li>
  );
}
