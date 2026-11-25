/**
 * @fileoverview Servicio de stickers — encapsula todas las operaciones
 * de lectura y escritura contra la tabla `stickers` de Supabase.
 *
 * La base de datos valida la fila completa, incluso en actualizaciones parciales.
 */

import { supabase } from "../lib/supabaseClient";
import type { Sticker, StickerStatus, StickerCategoryOverride, StickersMap, Inventario } from "../types";

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------

/**
 * @description Forma de la fila tal como viene de Supabase (snake_case).
 * Se mapea a la interfaz Sticker (camelCase) antes de salir del servicio.
 */
export interface StickerRow {
  codigo:      string;
  equipo:      string;
  tipo:        string;
  estado:      StickerStatus | "R" | "V";
  cantidad:    number;
  observacion: string | null;
  /** Override manual: 'TOP' | 'GOAT' | null */
  categoria:   StickerCategoryOverride | null;
  /** Precio individual de la lámina (null = usar default de su categoría) */
  precio:      number | null;
  /** Nombre de la lámina. Ej: "México - Lámina de prueba MEX2" */
  nombre:      string | null;
  updated_at:  string;
  updated_by:  string | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * @description Convierte una fila de Supabase al tipo Sticker del dominio.
 * @param row - Fila cruda de la tabla stickers
 * @returns Objeto Sticker tipado
 */
export function rowToSticker(row: StickerRow): Sticker {
  return {
    code:       row.codigo,
    team:       row.equipo,
    type:       row.tipo,
    // Mantiene la lectura compatible durante la transición de estados históricos.
    status:     row.estado === "D" || row.cantidad > 0 ? "D" : "F",
    quantity:   row.cantidad,
    notes:      row.observacion ?? undefined,
    // null de la DB se mantiene como null (sin override = auto-derivado en frontend)
    categoria:  row.categoria ?? null,
    // null = heredar precio default de la categoría; entero = precio individual
    precio:     row.precio ?? null,
    // undefined cuando la columna nombre aún no tiene valor en la DB
    name:       row.nombre ?? undefined,
    updated_at: row.updated_at,
    updated_by: row.updated_by ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Validación de invariantes
// ---------------------------------------------------------------------------

/**
 * @description Valida la invariante de negocio principal:
 * si quantity > 0, el estado no puede ser "F" (Falta).
 * @param status - Estado que se quiere asignar
 * @param quantity - Cantidad que se quiere asignar
 * @throws Error descriptivo si se viola la invariante
 */
function validateStickerState(status: StickerStatus, quantity: number): void {
  if (status === "F" && quantity > 0) {
    throw new Error(
      `Estado inválido: una lámina con cantidad ${quantity} no puede estar en estado "F" (Falta). ` +
      `Cambia el estado a "D" (Disponible) o reduce la cantidad a 0.`
    );
  }
}

// ---------------------------------------------------------------------------
// Operaciones de lectura
// ---------------------------------------------------------------------------

/**
 * @description Obtiene todos los stickers del inventario indicado como mapa normalizado.
 * @param inventario - Grupo de inventario a consultar ('CN' o 'AM')
 * @returns Mapa de stickers indexado por código, o lanza error si falla la query
 */
export async function fetchAllStickers(inventario: Inventario, signal?: AbortSignal): Promise<StickersMap> {
  const query = supabase
    .from("stickers")
    .select("*")
    .eq("inventario", inventario)  // Filtrar solo el inventario del usuario autenticado
    .order("equipo")               // Ordenar por equipo facilita la agrupación en la Vista Matriz
    .order("codigo");              // Dentro del equipo, ordenar por código
  const { data, error } = await (signal ? query.abortSignal(signal) : query);

  if (error) {
    throw new Error(`Error al cargar las láminas: ${error.message}`);
  }

  // Construir el mapa normalizado: { "MEX1": Sticker, "MEX2": Sticker, ... }
  const map: StickersMap = {};
  for (const row of data as StickerRow[]) {
    const sticker = rowToSticker(row);
    map[sticker.code] = sticker;
  }

  return map;
}

// ---------------------------------------------------------------------------
// Operaciones de escritura
// ---------------------------------------------------------------------------

/**
 * @description Actualiza campos específicos de una lámina.
 * Valida invariantes antes de persistir.
 * @param code - Código de la lámina a actualizar
 * @param fields - Campos a actualizar (parcial de Sticker)
 * @returns La lámina actualizada con todos sus campos
 * @throws Error si la validación de invariantes falla o la query falla
 */
export async function updateSticker(
  code: string,
  inventario: Inventario,
  fields: Partial<Pick<Sticker, "status" | "quantity" | "notes" | "categoria" | "precio">>
): Promise<Sticker> {
  if (fields.quantity !== undefined && (!Number.isInteger(fields.quantity) || fields.quantity < 0)) {
    throw new Error("La cantidad debe ser un entero no negativo.");
  }

  // Si vienen status y quantity juntos, validar la combinación
  if (fields.status !== undefined && fields.quantity !== undefined) {
    validateStickerState(fields.status, fields.quantity);
  }

  // Construir el objeto de actualización en snake_case para Supabase
  const update: Record<string, unknown> = {};
  if (fields.status    !== undefined) update.estado     = fields.status;
  if (fields.quantity  !== undefined) update.cantidad   = fields.quantity;
  if (fields.notes     !== undefined) update.observacion = fields.notes;
  // categoria puede ser 'TOP' | 'GOAT' | null (null borra el override manual)
  if ("categoria" in fields)          update.categoria  = fields.categoria ?? null;
  // precio puede ser un entero (override individual) o null (volver al default de categoría)
  if ("precio" in fields)             update.precio     = fields.precio ?? null;

  const { data, error } = await supabase
    .from("stickers")
    .update(update)
    .eq("codigo", code)
    .eq("inventario", inventario)  // PK compuesto: codigo + inventario
    .select()
    .single();

  if (error) {
    throw new Error(`Error al actualizar la lámina ${code}: ${error.message}`);
  }

  return rowToSticker(data as StickerRow);
}
