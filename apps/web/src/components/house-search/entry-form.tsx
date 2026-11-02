import { useState, type FormEvent } from "react";
import { HOUSE_SEARCH_STATUSES, type HouseSearchStatus } from "@shared/types/house-search";
import { AddressSearchBox } from "@/components/address-search-box";
import { Field, buttonClass, inputClass, primaryClass } from "@/components/research/fields";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import { EMPTY_FORM, parseEntryForm, toIsoDate, type EntryErrors, type EntryFormValues, type ParsedEntry } from "@/lib/house-search-schema";
import { houseSearchErrorKey } from "./error-key";
import { RatingInput } from "./rating-input";

type ValidInput = Extract<ParsedEntry, { ok: true }>["input"];

interface EntryFormProps {
  onAdd: (input: ValidInput) => Promise<unknown>;
  saving: boolean;
}

const initial = (): EntryFormValues => ({ ...EMPTY_FORM, seenAt: toIsoDate(new Date()) });

export function EntryForm({ onAdd, saving }: EntryFormProps) {
  const { t } = useI18n();
  const [values, setValues] = useState<EntryFormValues>(initial);
  const [errors, setErrors] = useState<EntryErrors>({});
  const [serverError, setServerError] = useState<TranslationKey | null>(null);
  const [added, setAdded] = useState(false);
  // Bumping the key remounts the address box, clearing its text after a save or "change address".
  const [addressKey, setAddressKey] = useState(0);

  const set = <K extends keyof EntryFormValues>(key: K, value: EntryFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setAdded(false);
  };

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setServerError(null);
    const parsed = parseEntryForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    try {
      await onAdd(parsed.input);
      setValues(initial());
      setAddressKey((k) => k + 1);
      setAdded(true);
    } catch (error) {
      setServerError(houseSearchErrorKey(error));
    }
  }

  const fieldError = (field: keyof EntryErrors) =>
    errors[field] ? (
      <span role="alert" className="mt-1 block text-xs font-normal text-danger">
        {t(`hs.fieldError.${errors[field]}` as TranslationKey)}
      </span>
    ) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-2xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="hs-form-title">
      <h3 id="hs-form-title" className="mb-3 text-lg font-bold tracking-tight">{t("hs.form.title")}</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {values.husnummerId ? (
            <>
            <span className="block text-sm font-semibold text-ink-soft">{t("hs.form.address")}</span>
            <div className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface-alt px-3 py-2 text-sm">
              <span className="font-semibold text-ink">{values.addressLabel}</span>
              <button
                type="button"
                className="text-xs font-semibold text-brand underline"
                onClick={() => {
                  setValues((v) => ({ ...v, husnummerId: "", addressLabel: "" }));
                  setAddressKey((k) => k + 1);
                }}
              >
                {t("hs.form.changeAddress")}
              </button>
            </div>
            </>
          ) : (
            // The box brings its own label and hint.
            <AddressSearchBox key={addressKey} onSelect={(a) => setValues((v) => ({ ...v, husnummerId: a.id, addressLabel: a.label }))} />
          )}
          {fieldError("address")}
        </div>

        <Field label={t("hs.form.date")}>
          <input className={inputClass} type="date" value={values.seenAt} onChange={(e) => set("seenAt", e.target.value)} />
          {fieldError("seenAt")}
        </Field>

        <Field label={t("hs.form.price")}>
          <input className={inputClass} inputMode="numeric" autoComplete="off" placeholder={t("hs.form.pricePlaceholder")} value={values.price} onChange={(e) => set("price", e.target.value)} />
          {fieldError("price")}
        </Field>

        <Field label={t("hs.form.rooms")}>
          <input className={inputClass} inputMode="numeric" autoComplete="off" value={values.rooms} onChange={(e) => set("rooms", e.target.value)} />
          {fieldError("rooms")}
        </Field>

        <Field label={t("hs.form.status")}>
          <select className={inputClass} value={values.status} onChange={(e) => set("status", e.target.value)}>
            {HOUSE_SEARCH_STATUSES.map((s: HouseSearchStatus) => (
              <option key={s} value={s}>{t(`hs.status.${s}` as TranslationKey)}</option>
            ))}
          </select>
          {fieldError("status")}
        </Field>

        <div className="sm:col-span-2">
          <span className="block text-sm font-semibold text-ink-soft">{t("hs.form.rating")}</span>
          <RatingInput label={t("hs.form.rating")} value={values.rating ? Number(values.rating) : null} onChange={(v) => set("rating", v === null ? "" : String(v))} />
          {fieldError("rating")}
        </div>

        <div className="sm:col-span-2">
          <Field label={t("hs.form.notes")}>
            <textarea className={inputClass} rows={2} maxLength={2000} value={values.notes} onChange={(e) => set("notes", e.target.value)} />
            {fieldError("notes")}
          </Field>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryClass} disabled={saving}>
          {saving ? t("hs.form.saving") : t("hs.form.submit")}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={() => { setValues(initial()); setErrors({}); setServerError(null); setAddressKey((k) => k + 1); }}>
          {t("hs.list.cancel")}
        </button>
        <span aria-live="polite" className="text-sm text-success-text">{added ? t("hs.form.added") : ""}</span>
        {serverError && <span role="alert" className="text-sm text-danger">{t(serverError)}</span>}
      </div>
    </form>
  );
}
