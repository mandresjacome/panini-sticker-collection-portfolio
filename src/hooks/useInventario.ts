import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import type { Inventario } from "../types";

export function useInventario(userId: string | undefined) {
  return useQuery({
    queryKey: ["inventory-membership", userId],
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<Inventario | null> => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from("inventory_memberships")
        .select("inventario")
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle();

      if (error) throw error;
      return data?.inventario ?? null;
    },
  });
}
