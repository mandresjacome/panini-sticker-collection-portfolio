/**
 * @fileoverview Store de stickers de la vista activa usando Zustand.
 *
 * El estado se normaliza como un mapa indexado por código.
 *
 * Este store solo gestiona el ESTADO en memoria.
 * Las llamadas a Supabase ocurren en el hook useStickers.
 */

import { createStore } from "zustand";
import type { Sticker, StickersMap } from "../types";

// ---------------------------------------------------------------------------
// Tipos del store
// ---------------------------------------------------------------------------

/**
 * @description Estado y acciones del store de stickers.
 */
interface StickerStore {
  // --- Estado ---

  /** Mapa normalizado de todos los stickers. Clave: código de lámina */
  stickers: StickersMap;

  // --- Acciones ---

  /**
   * @description Reemplaza el mapa completo de stickers (carga inicial).
   * @param stickers - Mapa normalizado de todos los stickers
   */
  setStickers: (stickers: StickersMap) => void;

  // --- Selectores derivados ---

  /**
   * @description Retorna todos los stickers como array ordenado.
   * @returns Array de stickers ordenado por código
   */
  getStickersArray: () => Sticker[];

}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * @description Store de Zustand para el inventario de láminas.
 * Cada vista crea su instancia con el inventario autorizado del panel.
 */
export const createStickerStore = (stickers: StickersMap = {}) => createStore<StickerStore>((set, get) => ({
  // --- Estado inicial ---
  stickers,

  // --- Acciones ---

  setStickers: (stickers) => set({ stickers }),

  // --- Selectores derivados ---

  getStickersArray: () =>
    // Orden natural numérico: ALG1 < ALG2 < ... < ALG10 (no lexicográfico)
    Object.values(get().stickers).sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
    ),

}));
