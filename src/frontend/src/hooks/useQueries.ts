import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useActor } from "./useActor";

export function useGetHighScore() {
  const { actor, isFetching } = useActor();
  return useQuery<number>({
    queryKey: ["highScore"],
    queryFn: async () => {
      if (!actor) return 0;
      const score = await actor.getHighScore();
      return Number(score);
    },
    enabled: !!actor && !isFetching,
  });
}

export function useSubmitScore() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (score: number) => {
      if (!actor) return;
      await actor.submitScore(BigInt(score));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["highScore"] });
    },
  });
}
