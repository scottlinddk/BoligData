import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listRecommendations, respondToRecommendation, sendRecommendations } from "@/lib/api";
import type { CreateRecommendationsBody, RespondRecommendationBody } from "@shared/types/api";

/** Recommendations the caller has received as a client, plus a mutation to accept/dismiss. */
export function useReceivedRecommendations(refetchInterval?: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["recommendations", "received"],
    queryFn: () => listRecommendations("received"),
    refetchInterval,
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: RespondRecommendationBody }) => respondToRecommendation(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
  });

  return {
    recommendations: query.data?.recommendations ?? [],
    properties: query.data?.properties ?? [],
    isLoading: query.isLoading,
    respond: respondMutation.mutateAsync,
    isResponding: respondMutation.isPending,
  };
}

/** Recommendations the caller has sent as an advisor/agent, including the client's response. */
export function useSentRecommendations() {
  const query = useQuery({ queryKey: ["recommendations", "sent"], queryFn: () => listRecommendations("sent") });
  return {
    recommendations: query.data?.recommendations ?? [],
    properties: query.data?.properties ?? [],
    isLoading: query.isLoading,
  };
}

export function useSendRecommendations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateRecommendationsBody) => sendRecommendations(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recommendations"] }),
  });
}
