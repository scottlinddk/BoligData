import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountSubNav } from "@/components/account-subnav";
import {
  getAppSettings,
  getProfile,
  listRegisteredAgents,
  updateAppSettings,
  updateProfile,
} from "@/lib/api";
import { useToast } from "@/components/toast";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { LeadRouting, NotificationChannels, NotificationType } from "@shared/types/index";

const NOTIFICATION_TYPES: NotificationType[] = [
  "new_listing",
  "price_drop",
  "message",
  "data_update",
  "system",
];
const TYPE_LABEL_KEY: Record<NotificationType, TranslationKey> = {
  new_listing: "notifications.type.newListing",
  price_drop: "notifications.type.priceDrop",
  message: "notifications.type.message",
  data_update: "notifications.type.dataUpdate",
  system: "notifications.type.system",
};

export function AccountSettingsPage() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({ queryKey: ["account", "profile"], queryFn: getProfile });
  const role = profileQuery.data?.profile.role;

  const [channels, setChannels] = useState<NotificationChannels | null>(null);
  const [agencyName, setAgencyName] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [leadRouting, setLeadRouting] = useState<LeadRouting>("roundRobin");
  const [notifyNewLead, setNotifyNewLead] = useState(true);

  useEffect(() => {
    if (!profileQuery.data) return;
    setChannels(profileQuery.data.profile.notificationChannels);
    setLicenseNumber(profileQuery.data.profile.licenseNumber ?? "");
    setLeadRouting(profileQuery.data.profile.leadRouting);
    setNotifyNewLead(profileQuery.data.profile.notifyNewLead);
  }, [profileQuery.data]);
  useEffect(() => {
    setAgencyName(profileQuery.data?.profile.organizationName ?? "");
  }, [profileQuery.data?.profile.organizationName]);

  const saveMutation = useMutation({
    mutationFn: (
      body: Parameters<typeof updateProfile>[0],
    ) => updateProfile(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["account", "profile"] });
      showToast(t("profile.saveSuccess"), "success");
    },
    onError: () => showToast(t("profile.saveError"), "error"),
  });

  function toggleChannel(type: NotificationType, channel: "email" | "push") {
    if (!channels) return;
    const next: NotificationChannels = {
      ...channels,
      [type]: { ...channels[type], [channel]: !channels[type][channel] },
    };
    setChannels(next);
    saveMutation.mutate({ notificationChannels: next });
  }

  function saveAgencyProfile() {
    saveMutation.mutate({ licenseNumber: licenseNumber || null, leadRouting, notifyNewLead });
  }

  const appSettingsQuery = useQuery({
    queryKey: ["admin", "app-settings"],
    queryFn: getAppSettings,
    enabled: role === "admin",
  });
  const agentsQuery = useQuery({
    queryKey: ["admin", "agents"],
    queryFn: listRegisteredAgents,
    enabled: role === "admin",
  });
  const broadcastMutation = useMutation({
    mutationFn: (broadcastEnabled: boolean) => updateAppSettings({ broadcastEnabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "app-settings"] }),
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <AccountSubNav />
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-ink">{t("settings.title")}</h1>
        {role && (
          <span className="rounded-full border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            {t(`role.${role}` as TranslationKey)}
          </span>
        )}
      </div>

      <div className="mb-4 rounded-[20px] border border-border bg-surface p-4">
        <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-soft">
          {t("settings.notificationsCard")}
        </h2>
        {channels && (
          <div className="flex flex-col gap-2">
            {NOTIFICATION_TYPES.map((type) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">{t(TYPE_LABEL_KEY[type])}</span>
                <div className="flex gap-1.5">
                  {(["email", "push"] as const).map((channel) => (
                    <button
                      key={channel}
                      type="button"
                      onClick={() => toggleChannel(type, channel)}
                      className={`rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase ${
                        channels[type][channel]
                          ? "bg-cta text-cta-text"
                          : "border border-border bg-surface text-ink-soft"
                      }`}
                    >
                      {t(`settings.channel.${channel}` as TranslationKey)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {role === "agent" && (
        <div className="mb-4 rounded-[20px] border border-border bg-surface p-4">
          <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-soft">
            {t("settings.agencyCard")}
          </h2>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-ink-soft">{t("settings.agencyName")}</span>
              <input
                value={agencyName}
                disabled
                className="rounded-full border border-border bg-surface-alt px-4 py-2.5 text-sm text-ink-faint"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-bold text-ink-soft">{t("settings.licenseNumber")}</span>
              <input
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="rounded-full border border-border bg-paper px-4 py-2.5 text-sm text-ink"
              />
            </label>
            <div>
              <p className="mb-1.5 text-xs font-bold text-ink-soft">{t("settings.leadRouting")}</p>
              <div className="flex gap-2">
                {(["roundRobin", "manual"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setLeadRouting(option)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      leadRouting === option ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"
                    }`}
                  >
                    {t(`settings.leadRouting.${option}` as TranslationKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{t("settings.notifyNewLead")}</span>
              <button
                type="button"
                onClick={() => setNotifyNewLead((v) => !v)}
                className={`rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase ${
                  notifyNewLead ? "bg-cta text-cta-text" : "border border-border bg-surface text-ink-soft"
                }`}
              >
                {notifyNewLead ? "On" : "Off"}
              </button>
            </div>
            <button
              type="button"
              onClick={saveAgencyProfile}
              disabled={saveMutation.isPending}
              className="self-start rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {saveMutation.isPending ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}

      {role === "admin" && (
        <>
          <div className="mb-4 rounded-[20px] border border-border bg-surface p-4">
            <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-soft">
              {t("settings.systemNoticesCard")}
            </h2>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{t("settings.broadcastEnabled")}</span>
              <button
                type="button"
                onClick={() => broadcastMutation.mutate(!appSettingsQuery.data?.settings.broadcastEnabled)}
                className={`rounded-full px-3 py-1.5 font-mono text-[10px] font-bold uppercase ${
                  appSettingsQuery.data?.settings.broadcastEnabled
                    ? "bg-cta text-cta-text"
                    : "border border-border bg-surface text-ink-soft"
                }`}
              >
                {appSettingsQuery.data?.settings.broadcastEnabled ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div className="mb-4 rounded-[20px] border border-border bg-surface p-4">
            <h2 className="mb-3 font-mono text-xs font-bold uppercase tracking-widest text-ink-soft">
              {t("settings.registeredAgentsCard")}
            </h2>
            {(agentsQuery.data?.agents.length ?? 0) === 0 ? (
              <p className="text-sm font-semibold text-ink-soft">{t("settings.registeredAgentsEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {agentsQuery.data?.agents.map((agent) => (
                  <li key={agent.id} className="flex items-center justify-between rounded-xl border border-border p-2.5">
                    <span className="text-sm font-semibold text-ink">{agent.organizationName || agent.email}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                      {t("role.agent")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
