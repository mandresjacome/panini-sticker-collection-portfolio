-- Conservar cantidades y reflejar la disponibilidad que usaba el panel para
-- datos históricos. Revisar las filas V con stock antes de aplicar el cambio.
UPDATE public.stickers
SET estado = CASE WHEN cantidad > 0 THEN 'D' ELSE 'F' END
WHERE estado IN ('R', 'V') OR (estado = 'F' AND cantidad > 0);

ALTER TABLE public.stickers
  DROP CONSTRAINT IF EXISTS stickers_estado_check,
  ADD CONSTRAINT stickers_estado_fd CHECK (estado IN ('F', 'D')),
  ADD CONSTRAINT stickers_falta_sin_stock CHECK (estado <> 'F' OR cantidad = 0);

COMMENT ON COLUMN public.stickers.estado IS 'F = Falta, D = Disponible.';

-- La vista del catálogo es la ruta pública. El panel lee filas completas y
-- solo puede editar los campos que usa la aplicación.
REVOKE ALL ON public.stickers FROM PUBLIC, anon, authenticated;
REVOKE ALL (codigo, equipo, tipo, estado, cantidad, observacion, categoria, precio, nombre,
            inventario, updated_at, updated_by)
  ON public.stickers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stickers TO authenticated;
GRANT UPDATE (estado, cantidad, observacion, categoria, precio) ON public.stickers TO authenticated;

-- La política restrictiva se combina con las políticas permisivas de 001.
-- USING protege la fila actual y WITH CHECK protege su versión actualizada.
CREATE POLICY stickers_require_membership
  ON public.stickers AS RESTRICTIVE FOR ALL TO authenticated
  USING (inventario = (
    SELECT membership.inventario FROM public.inventory_memberships AS membership
    WHERE membership.user_id = (SELECT auth.uid())
  ))
  WITH CHECK (inventario = (
    SELECT membership.inventario FROM public.inventory_memberships AS membership
    WHERE membership.user_id = (SELECT auth.uid())
  ));

REVOKE ALL ON public.teams FROM PUBLIC, anon, authenticated;
REVOKE ALL (code, name) ON public.teams FROM PUBLIC, anon, authenticated;
GRANT SELECT (code, name) ON public.teams TO anon, authenticated;
CREATE POLICY teams_public_read ON public.teams FOR SELECT TO anon USING (true);

REVOKE ALL ON public.sellers FROM PUBLIC, anon, authenticated;
REVOKE ALL (id, slug, display_name, inventario, whatsapp, created_at)
  ON public.sellers FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS anon_can_read_sellers ON public.sellers;
DROP POLICY IF EXISTS auth_full_access_sellers ON public.sellers;

-- Los precios base ya son compartidos por ambos inventarios. Su lectura es
-- pública y la matriz mantiene el guardado mediante UPSERT para vendedores.
REVOKE ALL ON public.category_prices FROM PUBLIC, anon, authenticated;
REVOKE ALL (category, price, updated_at) ON public.category_prices FROM PUBLIC, anon, authenticated;
GRANT SELECT (category, price) ON public.category_prices TO anon, authenticated;
GRANT INSERT (category, price), UPDATE (category, price)
  ON public.category_prices TO authenticated;

CREATE POLICY category_prices_read_authenticated
  ON public.category_prices FOR SELECT TO authenticated USING (true);
CREATE POLICY category_prices_require_membership_on_insert
  ON public.category_prices AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_memberships WHERE user_id = (SELECT auth.uid())
  ));
CREATE POLICY category_prices_require_membership_on_update
  ON public.category_prices AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.inventory_memberships WHERE user_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.inventory_memberships WHERE user_id = (SELECT auth.uid())
  ));
