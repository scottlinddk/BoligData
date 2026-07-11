import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAdminUsers, updateAdminUser } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/translations";
import type { UserRole } from "@shared/types/index";

const ROLES: UserRole[] = ["admin", "user", "advisor", "agent"];

export function AdminUsersPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const usersQuery = useQuery({ queryKey: ["admin", "users"], queryFn: listAdminUsers });
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const updateMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => updateAdminUser(id, { role }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const users = usersQuery.data?.users ?? [];
  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return users;
    return users.filter(
      (u) => u.email.toLowerCase().includes(query) || u.role.toLowerCase().includes(query),
    );
  }, [users, search]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <h1 className="mb-4 font-serif text-3xl italic text-ink">{t("admin.users.title")}</h1>
      {users.length > 0 && (
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("admin.users.searchPlaceholder")}
          className="mb-4 w-full rounded-lg border border-border bg-paper px-3 py-2 text-sm text-ink"
        />
      )}
      {error && <p className="mb-4 text-sm font-semibold text-danger">{error}</p>}
      {users.length === 0 && <p className="font-semibold text-ink-soft">{t("admin.users.empty")}</p>}
      {users.length > 0 && filteredUsers.length === 0 && (
        <p className="font-semibold text-ink-soft">{t("admin.users.searchEmpty")}</p>
      )}
      <ul className="flex flex-col gap-2">
        {filteredUsers.map((u) => (
          <li
            key={u.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
          >
            <div className="font-bold text-ink">{u.email}</div>
            <select
              value={u.role}
              onChange={(e) => updateMutation.mutate({ id: u.id, role: e.target.value as UserRole })}
              className="rounded-lg border border-border bg-paper px-2 py-1 text-sm text-ink"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`role.${r}` as TranslationKey)}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
