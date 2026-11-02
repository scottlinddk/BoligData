import { useState, type FormEvent } from "react";
import { useI18n } from "@/i18n/i18n";
import { useHousehold } from "@/hooks/use-household";
import { buttonClass, inputClass, primaryClass } from "@/components/research/fields";
import { houseSearchErrorKey } from "./error-key";

/** Shown until the user has a household: create one, or join with a partner's invite code. */
export function HouseholdGate() {
  const { t } = useI18n();
  const { create, join } = useHousehold();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const busy = create.isPending || join.isPending;
  const error = create.error ?? join.error;

  function onCreate(event: FormEvent) {
    event.preventDefault();
    if (name.trim()) create.mutate(name.trim());
  }

  function onJoin(event: FormEvent) {
    event.preventDefault();
    if (code.trim()) join.mutate(code.trim());
  }

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-5 sm:p-6" aria-labelledby="hs-setup-title">
      <h2 id="hs-setup-title" className="text-xl font-bold tracking-tight">{t("hs.setup.title")}</h2>
      <p className="mt-2 text-sm text-ink-soft">{t("hs.setup.intro")}</p>

      <form onSubmit={onCreate} className="mt-5 grid gap-3">
        <label className="block text-sm font-semibold text-ink-soft">
          {t("hs.setup.createLabel")}
          <input className={inputClass} value={name} maxLength={80} placeholder={t("hs.setup.namePlaceholder")} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className={`${primaryClass} justify-self-start`} disabled={busy || !name.trim()}>
          {create.isPending ? t("hs.setup.working") : t("hs.setup.createButton")}
        </button>
      </form>

      <hr className="my-6 border-border" />

      <form onSubmit={onJoin} className="grid gap-3">
        <label className="block text-sm font-semibold text-ink-soft">
          {t("hs.setup.joinLabel")}
          <input
            className={`${inputClass} font-mono uppercase tracking-widest`}
            value={code}
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
        <button type="submit" className={`${buttonClass} justify-self-start`} disabled={busy || !code.trim()}>
          {join.isPending ? t("hs.setup.working") : t("hs.setup.joinButton")}
        </button>
      </form>

      {error && <p role="alert" className="mt-4 text-sm text-danger">{t(houseSearchErrorKey(error))}</p>}
    </section>
  );
}
