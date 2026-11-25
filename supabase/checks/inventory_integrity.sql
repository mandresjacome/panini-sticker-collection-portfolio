-- Ejecutar sobre una base de pruebas recién migrada y sembrada, como postgres.
BEGIN;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.teams) <> 50
     OR (SELECT count(nombre) FROM public.stickers WHERE inventario = 'CN') <> 994
     OR (SELECT count(nombre) FROM public.stickers WHERE inventario = 'AM') <> 994
     OR (SELECT count(*) FROM public.stickers) <> 1988 THEN
    RAISE EXCEPTION 'El seed debe crear 50 equipos y 994 láminas con nombre por inventario';
  END IF;
END $$;

INSERT INTO auth.users (id) VALUES
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002'),
  ('10000000-0000-0000-0000-000000000003');

INSERT INTO public.inventory_memberships (user_id, inventario) VALUES
  ('10000000-0000-0000-0000-000000000001', 'CN'),
  ('10000000-0000-0000-0000-000000000002', 'AM');

UPDATE public.stickers SET estado = 'D', cantidad = 2, observacion = 'Nota privada de prueba'
WHERE codigo = 'FWC00';
UPDATE public.stickers SET estado = 'D', cantidad = 0
WHERE codigo = 'FWC1' AND inventario = 'CN';

SET LOCAL ROLE anon;
DO $$
BEGIN
  IF (SELECT count(codigo) FROM public.catalog_stickers) <> 2
     OR EXISTS (SELECT 1 FROM public.catalog_stickers WHERE estado <> 'D' OR cantidad = 0)
     OR (SELECT count(code) FROM public.teams) <> 50
     OR (SELECT count(category) FROM public.category_prices) <> 7
     OR NOT EXISTS (SELECT 1 FROM public.catalog_sellers WHERE slug = 'replica' AND inventario = 'AM') THEN
    RAISE EXCEPTION 'El catálogo anónimo debe mostrar solo stock y datos públicos';
  END IF;

  IF has_column_privilege(current_user, 'public.stickers', 'codigo', 'SELECT')
     OR EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'catalog_stickers'
         AND column_name IN ('observacion', 'updated_at', 'updated_by')
     )
     OR has_column_privilege(current_user, 'public.sellers', 'whatsapp', 'SELECT')
     OR has_column_privilege(current_user, 'public.category_prices', 'updated_at', 'SELECT')
     OR has_table_privilege(current_user, 'public.inventory_memberships', 'SELECT') THEN
    RAISE EXCEPTION 'El catálogo expone información privada';
  END IF;

  BEGIN
    UPDATE public.catalog_stickers SET cantidad = 9 WHERE codigo = 'FWC00';
    RAISE EXCEPTION 'El catálogo anónimo permitió modificar stock';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.category_prices SET price = 9 WHERE category = 'BASICA';
    RAISE EXCEPTION 'El visitante pudo modificar precios';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.inventory_memberships) <> 1
     OR (SELECT count(*) FROM public.stickers WHERE inventario = 'CN') <> 994
     OR EXISTS (SELECT 1 FROM public.stickers WHERE inventario = 'AM')
     OR (SELECT count(*) FROM public.catalog_stickers WHERE codigo = 'FWC00') <> 2 THEN
    RAISE EXCEPTION 'El usuario CN debe distinguir su inventario del catálogo público';
  END IF;

  UPDATE public.stickers SET cantidad = 3 WHERE codigo = 'FWC00' AND inventario = 'CN';
  IF NOT FOUND THEN RAISE EXCEPTION 'El vendedor perdió acceso a su inventario'; END IF;

  UPDATE public.stickers SET observacion = 'Edición parcial válida' WHERE codigo = 'FWC2';
  IF NOT FOUND THEN RAISE EXCEPTION 'Se rechazó una edición parcial válida'; END IF;

  UPDATE public.stickers SET cantidad = 8 WHERE codigo = 'FWC00' AND inventario = 'AM';
  IF FOUND THEN RAISE EXCEPTION 'El vendedor CN modificó el inventario AM'; END IF;

  BEGIN
    UPDATE public.stickers SET inventario = 'AM' WHERE codigo = 'FWC00';
    RAISE EXCEPTION 'El vendedor pudo mover una lámina a otro inventario';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.inventory_memberships SET inventario = 'AM';
    RAISE EXCEPTION 'El vendedor pudo cambiar su membresía';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.stickers SET estado = 'F' WHERE codigo = 'FWC00';
    RAISE EXCEPTION 'Un cambio parcial de estado permitió F con stock';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.stickers SET cantidad = 2 WHERE codigo = 'FWC2';
    RAISE EXCEPTION 'Un cambio parcial de cantidad permitió F con stock';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.stickers SET cantidad = -1 WHERE codigo = 'FWC00';
    RAISE EXCEPTION 'Se aceptó stock negativo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    UPDATE public.stickers SET estado = 'R' WHERE codigo = 'FWC00';
    RAISE EXCEPTION 'Se aceptó el estado histórico R';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.stickers SET estado = 'F', cantidad = 0 WHERE codigo = 'FWC00';
  IF NOT FOUND THEN RAISE EXCEPTION 'Se rechazó una transición válida a F'; END IF;

  INSERT INTO public.category_prices (category, price)
    VALUES ('BASICA', 1234)
    ON CONFLICT (category) DO UPDATE SET category = EXCLUDED.category, price = EXCLUDED.price;
  IF (SELECT price FROM public.category_prices WHERE category = 'BASICA') <> 1234 THEN
    RAISE EXCEPTION 'El vendedor perdió acceso al ajuste de precios compartidos';
  END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stickers WHERE inventario = 'CN') THEN
    RAISE EXCEPTION 'El vendedor AM pudo leer el inventario privado CN';
  END IF;

  UPDATE public.stickers SET cantidad = 4 WHERE codigo = 'FWC00' AND inventario = 'AM';
  IF NOT FOUND THEN RAISE EXCEPTION 'El vendedor AM perdió acceso a su inventario'; END IF;

  UPDATE public.stickers SET cantidad = 0 WHERE codigo = 'FWC00' AND inventario = 'CN';
  IF FOUND THEN RAISE EXCEPTION 'El vendedor AM modificó el inventario CN'; END IF;

  UPDATE public.category_prices SET price = 2345 WHERE category = 'BASICA';
  IF NOT FOUND THEN RAISE EXCEPTION 'El vendedor AM perdió acceso a los precios compartidos'; END IF;
END $$;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.stickers) OR EXISTS (SELECT 1 FROM public.inventory_memberships)
     OR NOT EXISTS (SELECT 1 FROM public.catalog_stickers WHERE inventario = 'AM') THEN
    RAISE EXCEPTION 'La cuenta sin membresía debe acceder solamente al catálogo';
  END IF;

  UPDATE public.stickers SET cantidad = 0 WHERE codigo = 'FWC00';
  IF FOUND THEN RAISE EXCEPTION 'Una cuenta sin membresía modificó stock'; END IF;

  UPDATE public.category_prices SET price = 9 WHERE category = 'BASICA';
  IF FOUND THEN RAISE EXCEPTION 'Una cuenta sin membresía modificó precios'; END IF;

  BEGIN
    INSERT INTO public.category_prices (category, price) VALUES ('PRUEBA', 9);
    RAISE EXCEPTION 'Una cuenta sin membresía insertó precios';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

ROLLBACK;
