# Respaldos y restauración

Runbook de recuperación de la base de producción (`bkuwrpeseeqxdmmwlafa`, región `sa-east-1`).
Los números de abajo no son estimaciones: salen de una restauración real hecha el 10 de septiembre
de 2026 con el respaldo de producción de ese día.

## 1. Qué respalda Supabase hoy (y qué no)

```
$ npx supabase backups list
{"region":"sa-east-1","walg_enabled":true,"pitr_enabled":false,"backups":[]}
```

- **`walg_enabled: true`** — Supabase toma respaldos físicos de la instancia por su cuenta.
- **`pitr_enabled: false`** — **no hay point-in-time recovery.** No se puede volver a "las 14:32 de
  ayer, justo antes del borrado". Es un adicional de pago.
- **`backups: []`** — en este plan la restauración **no es autoservicio**. Ante un borrado
  accidental no hay botón: hay que abrir un ticket con soporte y esperar su respuesta.

**Conclusión:** el respaldo lógico que corrés vos (`scripts/backup.mjs`) no es redundancia — hoy es
el único respaldo sobre el que tenés control y el único con un tiempo de recuperación conocido.

## 2. Objetivos declarados

| | Valor | De dónde sale |
| --- | --- | --- |
| **RPO** (cuánto se puede perder) | Lo ocurrido desde el último dump | Depende de cada cuánto corras el respaldo. Diario ⇒ hasta 24 h de reservas |
| **RTO** (cuánto tarda volver) | **~4 minutos** de trabajo técnico | Medido: 1 min 50 s de dump + 7 s de restauración + verificación |
| Cobertura | Esquema completo y datos de negocio | Verificado tabla por tabla, ver §4 |
| Hueco conocido | Cuentas de acceso (`auth.users`) | Ver §5 |

El RTO real frente al cliente es mayor: incluye darse cuenta del problema, decidir restaurar y
recrear los accesos. Contá **una hora** de punta a punta y prometé eso, no los cuatro minutos.

## 3. Tomar un respaldo

```sh
node scripts/backup.mjs              # escribe en ./backups (ignorada por git)
node scripts/backup.mjs D:/respaldos # o donde prefieras
```

Genera dos archivos con marca de tiempo: `-schema.sql` (~177 kB) y `-data.sql` (~60 kB y creciendo
con las reservas).

**El archivo de datos contiene nombres, teléfonos y correos de clientes reales de cada salón.** Es
dato personal bajo la Ley 21.719 y bajo el Anexo A de los términos: guardalo cifrado, fuera de
carpetas sincronizadas sin cifrar, y borralo cuando ya no lo necesites. Un respaldo filtrado es un
incidente de seguridad igual que una base filtrada.

Frecuencia mínima recomendada mientras no haya PITR: **diaria**, y además una antes de cada
migración que toque datos.

## 4. Restaurar (procedimiento verificado)

Sobre una base Postgres limpia — un proyecto nuevo de Supabase, o el Postgres local para verificar
que el respaldo sirve:

```sh
# 1. base vacía
docker exec supabase_db_agenda2 psql -U postgres -c "create database restore_test;"

# 2. copiar los dos archivos al contenedor
docker cp <fecha>-schema.sql supabase_db_agenda2:/tmp/schema.sql
docker cp <fecha>-data.sql   supabase_db_agenda2:/tmp/data.sql

# 3. restaurar, esquema primero
MSYS_NO_PATHCONV=1 docker exec supabase_db_agenda2 \
  psql -U postgres -d restore_test -f /tmp/schema.sql
MSYS_NO_PATHCONV=1 docker exec supabase_db_agenda2 \
  psql -U postgres -d restore_test -f /tmp/data.sql
```

`MSYS_NO_PATHCONV=1` es necesario en Git Bash en Windows: sin eso reescribe `/tmp/schema.sql` como
ruta de Windows y psql responde "No such file or directory" **sin que falle el comando**, con lo
que parece que restauró y en realidad no hizo nada. Fue exactamente lo que pasó en el primer
intento de esta prueba.

**Resultado medido (10-sep-2026):** 7 segundos, **cero errores** en esquema y en datos.

Verificación posterior, comparando contra producción:

| Tabla | Producción | Restaurado |
| --- | --- | --- |
| tenants | 3 | 3 |
| professionals | 10 | 10 |
| services | 29 | 29 |
| bookings | 6 | 6 |
| customers | 5 | 5 |
| push_subscriptions | 1 | 1 |

Todo el esquema volvió con él: tablas, funciones, **políticas RLS**, triggers y los cron de
`pg_cron`. Después de restaurar en un proyecto nuevo hay que revisar aparte los secretos del Vault
(`notification_dispatch_url`, `notification_dispatch_secret`) y las variables de las Edge Functions:
esos no viajan en el dump.

## 5. El hueco: las cuentas de acceso no están en el respaldo

`supabase db dump` cubre `public` y `storage`, **no `auth.users`**. Comprobado: en la copia
restaurada la tabla `auth.users` no existe.

Traducido: después de una restauración, los datos de los salones están completos —reservas,
clientes, servicios, horarios— pero **nadie puede iniciar sesión**, y las filas de `professionals`
apuntan con `auth_user_id` a usuarios que ya no existen.

Hay dos formas de cerrarlo:

1. **Recrear los accesos por email (sin trabajo manual de re-enlace).** Cada profesional vuelve a
   registrarse o es invitado con **el mismo correo** que tenía. La función
   `claim_invited_professional()` (migración 0024) vuelve a enlazar la fila de `professionals` con
   la nueva identidad comparando el email del JWT, así que el enlace se rehace solo. Es el camino
   práctico para un salón con tres o cuatro profesionales.
2. **Incluir `auth` en el respaldo.** Requiere conectarse con la contraseña de la base (la del
   panel de Supabase, no la del CLI) y hacer un `pg_dump -n auth` aparte. Da una restauración
   completa, pero ese archivo contiene los hashes de contraseñas de todos los usuarios: si lo
   hacés, cifralo sí o sí.

Mientras el producto tenga pocos salones, la opción 1 alcanza. Cuando haya veinte, la opción 2 —o
directamente contratar PITR— deja de ser opcional.

## 6. Cuándo volver a probar esto

Una restauración que no se prueba deja de ser un respaldo. Repetir el procedimiento de §4:

- después de cada migración que cambie el esquema de forma importante,
- al cambiar de plan en Supabase (sobre todo si se activa PITR: cambia todo este documento),
- y como mínimo **una vez cada tres meses**, anotando acá la fecha y el tiempo medido.

| Fecha | Quién | Tiempo | Resultado |
| --- | --- | --- | --- |
| 2026-09-10 | — | 7 s (restauración) | ✅ 6 tablas verificadas, 0 errores, sin `auth.users` |
