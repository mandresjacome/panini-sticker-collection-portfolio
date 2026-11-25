/**
 * @fileoverview Servicio de catálogo público.
 * Las vistas públicas de Supabase limitan las filas y columnas del catálogo.
 */

import { supabase } from "../lib/supabaseClient";
import type { Sticker, StickerCategoryOverride } from "../types";

// ---------------------------------------------------------------------------
// Tipo de fila de Supabase (snake_case español)
// ---------------------------------------------------------------------------

interface PublicStickerRow {
  codigo:    string;
  equipo:    string;
  tipo:      string;
  estado:    "D";
  cantidad:  number;
  /** Override manual de categoría (TOP/GOAT) o null si es auto-derivada */
  categoria: StickerCategoryOverride | null;
  /** Precio individual de venta (null = usar default de la categoría) */
  precio:    number | null;
  /** Nombre de la lámina. Ej: "México - Lámina de prueba MEX2" */
  nombre:    string | null;
}

// ---------------------------------------------------------------------------
// Funciones del catálogo
// ---------------------------------------------------------------------------

/**
 * @description Obtiene todas las láminas disponibles para la venta (estado = "D")
 * del inventario indicado.
 * @param inventario - Grupo de inventario a consultar ('CN' o 'AM')
 * @returns Mapa Record<teamCode, Sticker[]> con solo las láminas disponibles
 * @throws Error si la query falla
 */
export async function fetchAvailableStickers(inventario: string): Promise<Record<string, Sticker[]>> {
  const { data, error } = await supabase
    .from("catalog_stickers")
    .select("codigo, equipo, tipo, estado, cantidad, categoria, precio, nombre")
    .eq("inventario", inventario)
    .order("equipo")
    .order("codigo");

  if (error) {
    throw new Error(`Error al cargar el catálogo: ${error.message}`);
  }

  // Agrupar por equipo en un solo recorrido O(n)
  const grouped: Record<string, Sticker[]> = {};
  for (const row of data as PublicStickerRow[]) {
    const sticker: Sticker = {
      code:      row.codigo,
      team:      row.equipo,
      type:      row.tipo,
      status:    row.estado,
      quantity:  row.cantidad,
      // Propagar el override manual para que getStickerCategory() lo use en el cliente
      categoria: row.categoria ?? null,
      // Propagar el precio individual para la cotización (null = usar default de categoría)
      precio:    row.precio ?? null,
      // Nombre oficial (undefined si la columna aún no tiene valor)
      name:      row.nombre ?? undefined,
    };
    if (!grouped[sticker.team]) {
      grouped[sticker.team] = [];
    }
    grouped[sticker.team].push(sticker);
  }

  // Orden natural numérico dentro de cada equipo: ALG1, ALG2 ... ALG10 (no lexicográfico)
  for (const stickers of Object.values(grouped)) {
    stickers.sort((a, b) =>
      a.code.localeCompare(b.code, undefined, { numeric: true, sensitivity: "base" })
    );
  }

  return grouped;
}

/**
 * @description Obtiene los nombres completos de equipos para el catálogo público.
 * La tabla `teams` permite lectura pública de los códigos y nombres.
 *
 * @returns Mapa Record<teamCode, teamName>
 */
export async function fetchPublicTeams(): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("teams")
    .select("code, name")   // Las columnas reales en la tabla son "code" y "name" (no "codigo"/"nombre")
    .order("code");

  if (error) {
    // Si falla, retornar mapa vacío — los componentes usarán la sigla como fallback
    console.warn("No se pudieron cargar los nombres de equipos:", error.message);
    return {};
  }

  const map: Record<string, string> = {};
  for (const row of data as { code: string; name: string }[]) {
    map[row.code] = row.name;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Vendedores
// ---------------------------------------------------------------------------

/**
 * @description Datos públicos de un vendedor identificado por su slug de URL.
 */
export interface SellerPublic {
  /** Inventario que gestiona este vendedor: 'CN' | 'AM' */
  inventario: string;
}

/**
 * @description Busca un vendedor por su slug de URL.
 * Retorna `null` si el slug no existe. El catálogo usa su inventario general.
 *
 * @param slug - Identificador del vendedor en /laminas/:slug
 * @returns Datos del vendedor o null si no existe
 */
export async function fetchSeller(slug: string): Promise<SellerPublic | null> {
  const { data, error } = await supabase
    .from("catalog_sellers")
    .select("inventario")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.warn("Error buscando vendedor:", error.message);
    return null;
  }
  if (!data) return null;

  return { inventario: data.inventario };
}
