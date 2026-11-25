-- Las membresías se asignan por UUID desde un rol administrativo.
CREATE TABLE public.inventory_memberships (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  inventario text NOT NULL CHECK (inventario IN ('CN', 'AM'))
);

ALTER TABLE public.inventory_memberships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_memberships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventory_memberships TO authenticated;

CREATE POLICY inventory_memberships_read_own
  ON public.inventory_memberships FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- Las vistas usan los permisos de su propietario para publicar únicamente
-- las columnas del catálogo. Los roles de la API reciben solo SELECT.
CREATE VIEW public.catalog_stickers WITH (security_barrier = true) AS
  SELECT codigo, equipo, tipo, estado, cantidad, categoria, precio, nombre, inventario
  FROM public.stickers
  WHERE estado = 'D' AND cantidad > 0;

CREATE VIEW public.catalog_sellers AS
  SELECT slug, inventario
  FROM public.sellers;

REVOKE ALL ON public.catalog_stickers, public.catalog_sellers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.catalog_stickers, public.catalog_sellers TO anon, authenticated;

CREATE TRIGGER trg_category_prices_updated_at
  BEFORE UPDATE ON public.category_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
