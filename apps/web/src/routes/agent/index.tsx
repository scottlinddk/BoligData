import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listAgentListings, listMyConnections, promoteListing, unpromoteListing } from "@/lib/api";
import { ConnectionList } from "@/components/connection-list";
import { useI18n } from "@/i18n/i18n";
import { formatDkk } from "@shared/utils/price";

export function AgentPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const listingsQuery = useQuery({ queryKey: ["agent", "listings"], queryFn: listAgentListings });
  const connectionsQuery = useQuery({ queryKey: ["connections", "mine"], queryFn: listMyConnections });
  const myClients = (connectionsQuery.data?.connections ?? []).filter((c) => c.direction === "client");

  const promoteMutation = useMutation({
    mutationFn: promoteListing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent", "listings"] }),
  });
  const unpromoteMutation = useMutation({
    mutationFn: unpromoteListing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent", "listings"] }),
  });

  const properties = listingsQuery.data?.properties ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">{t("agent.title")}</h1>

      <ConnectionList
        connections={myClients}
        titleKey="connections.myClients.title"
        emptyKey="connections.myClients.empty"
      />

      {properties.length === 0 && <p className="font-semibold text-ink-soft">{t("agent.empty")}</p>}
      <ul className="flex flex-col gap-2">
        {properties.map((property) => (
          <li
            key={property.id}
            className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
          >
            <div>
              <div className="font-bold text-ink">{property.address}</div>
              <div className="text-xs font-semibold text-ink-soft">
                {formatDkk(property.price)}
                {property.isPromoted && (
                  <span className="ml-2 rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t("agent.promoted")}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() =>
                property.isPromoted
                  ? unpromoteMutation.mutate(property.id)
                  : promoteMutation.mutate(property.id)
              }
              className="rounded-full bg-cta px-3 py-1.5 text-sm font-bold text-cta-text transition hover:bg-cta-hover"
            >
              {property.isPromoted ? t("agent.unpromote") : t("agent.promote")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
