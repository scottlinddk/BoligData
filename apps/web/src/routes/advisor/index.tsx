import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { approveListing, listAdvisorFavorites } from "@/lib/api";
import { useI18n } from "@/i18n/i18n";
import { formatDkk } from "@shared/utils/price";

export function AdvisorPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const favoritesQuery = useQuery({ queryKey: ["advisor", "favorites"], queryFn: listAdvisorFavorites });

  const approveMutation = useMutation({
    mutationFn: ({ propertyId, userId }: { propertyId: string; userId: string }) =>
      approveListing(propertyId, { userId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["advisor", "favorites"] }),
  });

  const favorites = favoritesQuery.data?.favorites ?? [];
  const propertiesById = new Map((favoritesQuery.data?.properties ?? []).map((p) => [p.id, p]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("advisor.title")}</h1>
      <h2 className="mb-2 font-semibold text-ink-soft">{t("advisor.favorites")}</h2>
      {favorites.length === 0 && <p className="font-semibold text-ink-soft">{t("advisor.empty")}</p>}
      <ul className="flex flex-col gap-2">
        {favorites.map((fav) => {
          const property = propertiesById.get(fav.propertyId);
          if (!property) return null;
          return (
            <li
              key={fav.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
            >
              <div>
                <div className="font-bold text-ink">{property.address}</div>
                <div className="text-xs font-semibold text-ink-soft">{formatDkk(property.price)}</div>
              </div>
              <button
                onClick={() => approveMutation.mutate({ propertyId: property.id, userId: fav.userId })}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white hover:bg-brand-hover"
              >
                {t("advisor.approve")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
