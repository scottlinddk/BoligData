import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createInvitation, listInvitations, resendInvitation, revokeInvitation } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { UserRole } from "@shared/types/index";

const ROLES: UserRole[] = ["admin", "user", "advisor", "agent"];

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning-soft text-warning-text",
  accepted: "bg-success-soft text-success-text",
  revoked: "bg-unknown-soft text-unknown-text",
};

export function AdminInvitationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  const [error, setError] = useState<string | null>(null);

  const invitationsQuery = useQuery({ queryKey: ["admin", "invitations"], queryFn: listInvitations });

  const inviteMutation = useMutation({
    mutationFn: createInvitation,
    onSuccess: () => {
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeMutation = useMutation({
    mutationFn: revokeInvitation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] }),
  });

  const resendMutation = useMutation({
    mutationFn: resendInvitation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "invitations"] }),
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    inviteMutation.mutate({ email, role });
  }

  const invitations = invitationsQuery.data?.invitations ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("admin.invitations.title")}</h1>

      <form onSubmit={handleSubmit} className="mb-6 flex flex-wrap gap-2">
        <input
          type="email"
          required
          placeholder={t("admin.invitations.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-ink sm:w-auto sm:min-w-[220px]"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as UserRole)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-ink"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}` as TranslationKey)}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={inviteMutation.isPending}
          className="rounded-full bg-cta px-3 py-2 font-bold text-cta-text transition hover:bg-cta-hover disabled:opacity-50"
        >
          {inviteMutation.isPending ? t("admin.invitations.sending") : t("admin.invitations.invite")}
        </button>
      </form>
      <p className="-mt-4 mb-4 text-xs font-medium text-ink-faint">{t("admin.invitations.mockHint")}</p>
      {error && <p className="mb-4 text-sm font-semibold text-danger">{error}</p>}

      {invitationsQuery.isPending && (
        <ul className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-col gap-2">
                <div className="h-4 w-40 animate-pulse rounded bg-surface-alt" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-alt" />
              </div>
              <div className="h-7 w-28 animate-pulse rounded-lg bg-surface-alt" />
            </li>
          ))}
        </ul>
      )}

      {!invitationsQuery.isPending && invitations.length === 0 && (
        <p className="font-semibold text-ink-soft">{t("admin.invitations.empty")}</p>
      )}
      {!invitationsQuery.isPending && invitations.length > 0 && (
        <ul className="flex flex-col gap-2 animate-fade-up">
          {invitations.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
            >
              <div>
                <div className="font-bold text-ink">{inv.email}</div>
                <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-ink-soft">
                  <span>{t(`role.${inv.role}` as TranslationKey)}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLES[inv.status] ?? ""}`}
                  >
                    {t(`admin.invitations.status.${inv.status}` as TranslationKey)}
                  </span>
                </div>
              </div>
              {inv.status === "pending" && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => resendMutation.mutate(inv.id)}
                    disabled={resendMutation.isPending}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-ink disabled:opacity-50"
                  >
                    {resendMutation.isPending && resendMutation.variables === inv.id
                      ? t("admin.invitations.resending")
                      : t("admin.invitations.resend")}
                  </button>
                  <button
                    onClick={() => revokeMutation.mutate(inv.id)}
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-bold text-ink"
                  >
                    {t("admin.invitations.revoke")}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
