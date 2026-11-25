import { useCallback, useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useStore } from "zustand";
import { supabase } from "../lib/supabaseClient";
import { fetchAllStickers, updateSticker, rowToSticker } from "../services/stickerService";
import type { StickerRow } from "../services/stickerService";
import { createStickerStore } from "../store/stickerStore";
import type { AdminInventory } from "../components/admin/AdminLayout";
import type { Sticker, StickersMap } from "../types";
import { TOTAL_STICKERS as TOTAL } from "../types";

type EditableStickerFields = Partial<Pick<Sticker, "status" | "quantity" | "notes" | "categoria" | "precio">>;
let channelSequence = 0;

export interface UseStickersReturn {
  isLoading: boolean;
  error: string | null;
  stickersArray: Sticker[];
  updateStickerFields: (code: string, fields: EditableStickerFields) => Promise<void>;
  counts: { total: number; missing: number; available: number };
}

export function useStickers(): UseStickersReturn {
  const { userId, inventario } = useOutletContext<AdminInventory>();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["stickers", userId, inventario] as const, [userId, inventario]);
  const { data, isLoading, error: queryError } = useQuery({
    queryKey,
    queryFn: ({ signal }) => fetchAllStickers(inventario, signal),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const [store] = useState(() => createStickerStore(data));
  const { setStickers, getStickersArray } = useStore(store);

  useEffect(() => {
    if (data) setStickers(data);
  }, [data, setStickers]);

  const refreshInventory = useCallback(async () => {
    const filter = { queryKey, exact: true };
    await queryClient.cancelQueries(filter);
    await queryClient.invalidateQueries(filter);
  }, [queryClient, queryKey]);

  const applySticker = useCallback((sticker: Sticker) => {
    const current = queryClient.getQueryState<StickersMap>(queryKey);
    // Una lectura iniciada antes del evento puede devolver un snapshot anterior.
    if (!current?.data || current.fetchStatus === "fetching") {
      void refreshInventory();
      return;
    }
    queryClient.setQueryData<StickersMap>(queryKey, { ...current.data, [sticker.code]: sticker });
  }, [queryClient, queryKey, refreshInventory]);

  useEffect(() => {
    let active = true;
    // Un canal que se está cerrando todavía puede existir durante un remontaje.
    const channel = supabase
      .channel(`stickers-realtime-${inventario}-${++channelSequence}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "stickers",
        filter: `inventario=eq.${inventario}`,
      }, (payload) => {
        if (active && (payload.eventType === "UPDATE" || payload.eventType === "INSERT")) {
          applySticker(rowToSticker(payload.new as StickerRow));
        }
      })
      .subscribe((status) => {
        if (active && status === "SUBSCRIBED") {
          void refreshInventory();
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [inventario, applySticker, refreshInventory]);

  const updateMutation = useMutation({
    mutationFn: ({ code, fields }: { code: string; fields: EditableStickerFields }) =>
      updateSticker(code, inventario, fields),
    onSuccess: refreshInventory,
  });

  const stickersArray = getStickersArray();
  let available = 0;
  for (const sticker of stickersArray) {
    if (sticker.status === "D") available++;
  }

  const error = queryError ?? updateMutation.error;

  return {
    isLoading,
    error: error?.message ?? null,
    stickersArray,
    updateStickerFields: async (code, fields) => {
      await updateMutation.mutateAsync({ code, fields });
    },
    counts: { total: TOTAL, missing: stickersArray.length - available, available },
  };
}
