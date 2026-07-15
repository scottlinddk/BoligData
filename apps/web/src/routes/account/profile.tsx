import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountSubNav } from "@/components/account-subnav";
import { getProfile, updateProfile } from "@/lib/api";
import { useToast } from "@/components/toast";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { BestTimeToContact, ContactPreference } from "@shared/types/index";

const CONTACT_PREFS: ContactPreference[] = ["email", "phone", "app"];
const BEST_TIMES: BestTimeToContact[] = ["morning", "afternoon", "evening", "anytime"];

export function AccountProfilePage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["account", "profile"], queryFn: getProfile });

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactPref, setContactPref] = useState<ContactPreference>("email");
  const [bestTime, setBestTime] = useState<BestTimeToContact>("anytime");

  useEffect(() => {
    if (!profileQuery.data) return;
    setFullName(profileQuery.data.profile.fullName ?? "");
    setPhone(profileQuery.data.profile.phone ?? "");
    setContactPref(profileQuery.data.profile.contactPref);
    setBestTime(profileQuery.data.profile.bestTime);
  }, [profileQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({ fullName: fullName || null, phone: phone || null, contactPref, bestTime }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account", "profile"] });
      showToast(t("profile.saveSuccess"), "success");
    },
    onError: () => showToast(t("profile.saveError"), "error"),
  });

  const email = profileQuery.data?.email ?? "";

  return (
    <div className="mx-auto max-w-xl px-4 py-6">
      <AccountSubNav />
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("profile.title")}</h1>

      <div className="mb-4 rounded-[20px] border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-soft">
          {t("profile.identityCard")}
        </h2>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-ink-soft">{t("profile.name")}</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-ink-soft">{t("profile.email")}</span>
            <input
              value={email}
              disabled
              className="rounded-full border border-border bg-surface-alt px-4 py-2.5 text-sm text-ink-faint"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-bold text-ink-soft">{t("profile.phone")}</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink"
            />
          </label>
        </div>
      </div>

      <div className="mb-4 rounded-[20px] border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-soft">
          {t("profile.preferencesCard")}
        </h2>
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-bold text-ink-soft">{t("profile.contactPref")}</p>
          <div className="flex gap-2">
            {CONTACT_PREFS.map((pref) => (
              <button
                key={pref}
                type="button"
                onClick={() => setContactPref(pref)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                  contactPref === pref ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"
                }`}
              >
                {t(`profile.contactPref.${pref}` as TranslationKey)}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-bold text-ink-soft">{t("profile.bestTime")}</span>
          <select
            value={bestTime}
            onChange={(e) => setBestTime(e.target.value as BestTimeToContact)}
            className="rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink"
          >
            {BEST_TIMES.map((time) => (
              <option key={time} value={time}>
                {t(`profile.bestTime.${time}` as TranslationKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <button
        type="button"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
        className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
      >
        {saveMutation.isPending ? t("common.saving") : t("common.save")}
      </button>
    </div>
  );
}
