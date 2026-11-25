-- Migración 004 de la edición de portafolio.
-- El catálogo del proyecto original se atribuye a paninitrade.com/api/sticker-catalog.

ALTER TABLE public.stickers
  ADD COLUMN IF NOT EXISTS nombre TEXT;

COMMENT ON COLUMN public.stickers.nombre
  IS 'Nombre de la lámina. La edición de portafolio usa nombres de prueba.';

UPDATE public.stickers
SET nombre = 'Lámina de prueba ' || codigo
WHERE nombre IS NULL;
