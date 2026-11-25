# Base de datos de láminas

## Entorno nuevo de pruebas

1. Inicia un proyecto local de Supabase o usa un proyecto de pruebas aislado. Con la CLI, inicializa la configuración local con `supabase init` si todavía no existe.
2. En la base vacía, aplica las migraciones `001` a `007` en orden y después ejecuta `seed.sql`. El arranque inicial de Supabase local aplica ese orden. El seed crea 50 equipos o secciones y 994 láminas con nombre de prueba por inventario. Una segunda ejecución conserva las filas existentes.
3. Ejecuta `checks/inventory_integrity.sql` como `postgres` en esa base de pruebas, desde el editor SQL o con `psql -X -v ON_ERROR_STOP=1 -f supabase/checks/inventory_integrity.sql`. Verifica el destino antes de ejecutar el archivo. Las cuentas y escrituras de prueba se revierten en la misma transacción.
4. Para probar la aplicación completa, configura su URL y clave pública con los valores del entorno de pruebas. Crea dos usuarios de prueba en Auth, asigna uno a `CN` y el otro a `AM`, y marca una lámina de cada inventario como disponible con stock positivo. Prueba el catálogo como visitante y con sesión iniciada. En el panel, verifica el guardado, el cambio de cuenta, la recepción de cambios en dos sesiones del mismo inventario y el ajuste de precios compartidos.

## Datos y permisos de la demo

Usa esta edición con una base nueva. Los catálogos de ejemplo son `/laminas/demo-cn`, `/laminas/demo-cn-2` y `/laminas/replica`. El seed deja todas las láminas en estado faltante. El inventario se empieza a probar al registrar stock ficticio en el panel.

Asigna el UUID de cada usuario de prueba al inventario correspondiente desde el editor SQL del proyecto local.

```sql
INSERT INTO public.inventory_memberships (user_id, inventario)
VALUES ('<uuid-de-prueba>'::uuid, 'CN');
```

Repite la asignación con otro usuario para `AM`. Una cuenta sin membresía conserva el acceso al catálogo público. La escritura de precios base está disponible para los vendedores autorizados de ambos inventarios, porque los precios se comparten.
