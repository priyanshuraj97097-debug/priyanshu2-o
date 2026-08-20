import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Preferences = Database["public"]["Tables"]["user_preferences"]["Row"];

export const DEFAULT_PREFERENCES: Omit<Preferences, "user_id" | "created_at" | "updated_at"> = {
  auto_speak: false,
  custom_instructions: null,
  language: "auto",
  memory_enabled: true,
  model_preference: "balanced",
  notifications: true,
  send_on_enter: true,
  speech_rate: 1,
  theme: "dark",
  voice_name: "alloy",
  web_search_enabled: true,
};

export function usePreferences() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["preferences", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { ...DEFAULT_PREFERENCES, user_id: user!.id }) as Preferences;
    },
  });

  const update = useMutation({
    mutationFn: async (patch: Partial<Preferences>) => {
      const { error } = await supabase
        .from("user_preferences")
        .upsert({ user_id: user!.id, ...patch }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (patch) => {
      const key = ["preferences", user?.id];
      const previous = queryClient.getQueryData<Preferences>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_error, _patch, context) => {
      if (context?.previous) queryClient.setQueryData(["preferences", user?.id], context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["preferences", user?.id] });
    },
  });

  const preferences = (query.data ?? { ...DEFAULT_PREFERENCES, user_id: user?.id ?? "" }) as Preferences;
  return { preferences, isLoading: query.isLoading, update: update.mutate };
}