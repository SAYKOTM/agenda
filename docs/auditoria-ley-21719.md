# Auditoría de cumplimiento — Ley 21.719 (Protección de Datos Personales, Chile)

**Proyecto auditado:** `agenda2` — App de agendamiento de horas (tipo barbería/salón) multi-tenant.
**Stack real:** React 19 + Vite (frontend), **Supabase/PostgreSQL** (no Firebase/Firestore) con RLS, Supabase Edge Functions (Deno), Stripe (suscripción SaaS del tenant), Resend (email), Evolution API self-hosted + n8n (WhatsApp).
**Fecha:** 2026-08-31. **Vigencia plena de la ley:** 1 de diciembre de 2026.

> ⚠️ **Nota de alcance:** el pedido original describía un ecommerce de sushi sobre Firebase/Firestore con un programa "Zenko Points". Ese proyecto no existe en `D:\agenda2`. Este informe audita lo que **sí** existe: una app de reservas de citas sobre Supabase/Postgres, con un programa de fidelización por visitas (`src/lib/loyalty.js`, migración `0014_customers_and_loyalty.sql`) que cumple el rol equivalente a "Zenko Points" para efectos de este análisis. Los números de artículo citados corresponden al texto de la Ley 21.719 tal como fue descrito en la solicitud; se recomienda verificarlos contra el texto oficial vigente antes de usarlos en un documento legal formal.

## Resumen ejecutivo (ordenado de mayor a menor riesgo)

| # | Hallazgo | Artículo | Riesgo |
|---|---|---|---|
| 1 | Cuenta bancaria del negocio (titular, banco, **N° de cuenta**, **RUT**, email) legible públicamente sin autenticación vía API REST de Supabase | 14 quinquies, 14 quater, 3 c) | **Alto** |
| 2 | RPC pública `lookup_customer_tier` permite consultar por teléfono si una persona es cliente y su nivel de fidelidad, sin login | 3 c), 14 quater, 8 bis | **Alto** |
| 3 | No existe política de privacidad, aviso de tratamiento, ni identificación del responsable de datos en ningún punto del sitio | 14 ter | **Alto** |
| 4 | No hay checkbox de consentimiento en ningún formulario (registro, reserva); el tratamiento se hace sin captar consentimiento explícito | 12, 13 | **Alto** |
| 5 | No existe ningún canal, formulario ni correo dedicado para ejercer los derechos ARCOP | 4–9, 11, 14 ter b) y c) | **Alto** |
| 6 | Credenciales/API key débiles y hardcodeadas en `docker-compose.yml` versionado, con guardado íntegro de mensajes/contactos de WhatsApp de clientes | 14 quinquies, 14 sexies | **Alto** |
| 7 | Sin retención/expiración definida para `customers`, `bookings`, `reviews`, logs de notificación | 3 c) | **Medio** |
| 8 | Ficha de cliente completa (nombre, teléfono, email, historial, gasto) visible para todo el staff del salón, no solo quien lo atendió | 3 c), 14 quater | **Medio** |
| 9 | No hay proceso ni registro documentado de gestión de brechas de seguridad | 14 sexies | **Medio** |
| 10 | Sin verificación de edad; app puede procesar datos de menores sin resguardo alguno | 16 quáter | **Medio** |
| 11 | Cesión de datos a terceros (Stripe, Resend, Evolution/WhatsApp, Google) sin informarla ni recabar consentimiento específico | 15 | **Medio** |
| 12 | El "descuento de fidelidad" automático por nivel de visitas es un caso de elaboración de perfiles no declarado | 8 bis, 14 ter | **Medio** |
| 13 | Geolocalización: no aplica (no se recolecta ubicación del usuario), solo se muestra la dirección fija del local en un mapa | 16 sexies | **Bajo / N-A** |
| 14 | Secretos de servidor (Stripe, Resend, Evolution, Google Places) correctamente aislados del bundle cliente | — | **Bajo (positivo)** |
| 15 | No hay captura de datos de tarjeta en el frontend (pago online delega en Stripe Checkout hospedado) | 14 quinquies | **Bajo (positivo)** |

---

## 1. Consentimiento y base de licitud (arts. 12 y 13)

**Riesgo: Alto**

No existe en todo `src/` ningún checkbox, texto de consentimiento, ni enlace a "Términos y condiciones" o "Política de privacidad" (búsqueda de `consentimiento|términos|checkbox|privacy|acepto` sobre `src/` → 0 resultados).

- **Reserva de hora** — `src/features/booking/steps/StepForm.jsx:35-60`: pide nombre, teléfono, email y notas libres ("Alergias, preferencias…", línea 57) sin ningún checkbox de consentimiento ni enlace legal antes de enviar. El campo "Notas" es especialmente sensible porque puede terminar conteniendo datos de salud (alergias) sin que el usuario sepa que eso constituye un dato sensible bajo la ley.
- **Auto-registro de tenant (dueño de salón)** — `src/pages/Signup.jsx:74-119`: formulario de nombre, email y contraseña, sin checkbox de aceptación de términos ni política de privacidad.
- **Base de licitud implícita**: el tratamiento se apoya de facto en la ejecución del contrato (agendar la hora), lo cual podría sostenerse para los campos estrictamente necesarios (nombre, teléfono, fecha), pero no hay ninguna base declarada por escrito, y el campo "Notas" abre la puerta a datos que exceden lo necesario para el contrato.
- **Datos no necesarios para el contrato**: no se detectaron campos claramente superfluos en el formulario de reserva en sí (nombre/teléfono/email son razonables para confirmar una cita), pero si en el futuro se agregan campos opcionales de marketing sin distinguirlos del flujo transaccional, caerían en la presunción de no-consentimiento libre del art. 12 inciso 5.
- **Retiro de consentimiento**: no existe ningún mecanismo (ni siquiera manual/por correo) documentado para que el titular retire su consentimiento — no hay art. 12 inciso 4 satisfecho.

**Recomendación:** agregar un checkbox no premarcado antes de confirmar la reserva/registro, con enlace a una política de privacidad real, y separar cualquier dato opcional (ej. marketing) del flujo obligatorio de la cita.

---

## 2. Derechos ARCOP (arts. 4–9, 11)

**Riesgo: Alto**

- No existe ningún formulario, sección de perfil, ni dirección de correo dedicada a solicitudes de acceso, rectificación, cancelación, oposición, portabilidad o bloqueo. Búsqueda de `contacto@|soporte@|privacidad@|dpo@|exportar mis datos|eliminar cuenta` sobre `src/` → 0 resultados.
- El único canal cuasi-ARCOP existente es indirecto: `src/pages/ManageBooking.jsx:80-109` permite **cancelar** o **reagendar** una reserva propia vía un token público (`public_token`, generado en `supabase/functions/booking-by-token/index.ts:1-25`). Esto cubre parcialmente "cancelación" de una reserva puntual, pero:
  - No permite ver ni exportar los demás datos que el sistema guarda del titular (ficha en `customers`, historial completo, reseñas).
  - No permite rectificar nombre/teléfono/email ya guardados.
  - No cubre oposición, portabilidad ni bloqueo temporal.
  - No hay ningún flujo para eliminar el registro en `customers` (que persiste indefinidamente, ver hallazgo §10) ni las reseñas asociadas.
- Como no hay canal formal, tampoco existe (ni podría cumplirse hoy) el plazo de 30 días corridos + prórroga del art. 11, porque no hay proceso que reciba la solicitud, la acuse recibo ni la enrute a nadie.

**Recomendación:** publicar un correo o formulario único de "Protección de Datos" visible en el sitio y en el panel, y definir internamente quién y en qué plazo responde cada tipo de solicitud ARCOP.

---

## 3. Deber de información y transparencia (art. 14 ter)

**Riesgo: Alto**

Revisados: `src/pages/TenantLanding.jsx`, `src/components/ClientShell.jsx`, `src/components/WizardHeader.jsx`, `src/pages/panel/PanelSettings.jsx` y el flujo completo de reserva. No se encontró:

- Política de tratamiento de datos (con fecha/versión) — inexistente.
- Identidad y contacto del responsable de datos — inexistente (ni siquiera el nombre legal del salón/operador de la plataforma aparece consistentemente fuera de `tenants.name`).
- Categorías de datos tratados y finalidad — inexistente. Esto incluye no declarar que se trata: nombre, teléfono, email, notas (potencialmente datos de salud), historial de compra/visitas y nivel de fidelización.
- Plazo de conservación — inexistente (coherente con el hallazgo §10: no hay política de retención definida ni para declarar).
- Los 6 derechos y cómo ejercerlos — inexistente (coherente con §2).
- Elaboración de perfiles: el sistema de fidelización sí califica como elaboración de perfiles automatizada (ver §3-bis abajo) y no está declarado en ninguna parte.

### 3-bis. Elaboración de perfiles (art. 8 bis) — programa de fidelización

- `supabase/migrations/0014_customers_and_loyalty.sql:13-22` (`customer_loyalty_tier`) clasifica automáticamente a cada cliente en bronce/plata/oro/diamante según `visits_count`, y la función `create_booking` (líneas 156-179 del mismo archivo) aplica automáticamente un **descuento de precio** en base a ese perfil, sin intervención humana.
- `supabase/migrations/0014_customers_and_loyalty.sql:200-220` (`lookup_customer_tier`) expone ese perfil (tier + % de descuento) a través de una función marcada `security definer` con `grant execute ... to anon` — es decir, **cualquier visitante no autenticado** puede consultar el perfil de fidelidad de un cliente si conoce (o prueba) su número de teléfono, sin límite de tasa visible en el código revisado. Esto es tanto un problema de perfilado no declarado (art. 8 bis) como de proporcionalidad/diseño por defecto (ver §4).
- Front-end que consume esto: `src/features/booking/steps/StepPay.jsx:28,55` (`loyaltyPreview.tier`, `discountPct`) y `src/components/panel/LoyaltyBadge.jsx`.

**Recomendación:** publicar una página de política de privacidad enlazada desde el flujo de reserva y el panel, cubriendo los 6 puntos exigidos por el art. 14 ter, incluyendo mención explícita del perfilado por fidelidad.

---

## 4. Protección desde el diseño y por defecto (art. 14 quáter)

**Riesgo: Alto** (por el hallazgo de `tenant_bank_accounts` y `lookup_customer_tier`) / **Medio** en lo demás.

### 4.1 Cuenta bancaria pública sin necesidad — **Alto**

`supabase/migrations/0006_bank_accounts_public_read.sql:5-12`:

```sql
create policy tenant_bank_accounts_public_read on tenant_bank_accounts for select using (true);
...
grant select on tenant_bank_accounts to anon, authenticated;
```

La tabla `tenant_bank_accounts` (`supabase/migrations/0001_schema.sql:42-51`) tiene columnas `holder, bank, account_type, account_number, rut, notice_email`. La política RLS es `using (true)` **sobre la tabla completa**, sin restricción de columnas. El frontend sólo pide estas columnas en `src/features/tenant/useTenantData.js:55` y las muestra condicionalmente en `src/features/booking/steps/StepPay.jsx:94-104`, pero como Supabase expone una API REST genérica (PostgREST), **cualquiera puede hacer un `GET /rest/v1/tenant_bank_accounts?select=*` directo con la anon key pública y volcar el N° de cuenta y el RUT de todos los tenants**, sin pasar por el frontend ni por el flujo de reserva. El comentario del propio archivo (línea 2-3) confirma que esto fue una decisión consciente ("no son credenciales, son el destino del pago"), pero expone más datos personales (RUT, titular) de los que el propósito declarado (mostrar el N° de cuenta a quien ya eligió transferencia) requiere.

**Recomendación:** crear una vista/función `security definer` que devuelva solo lo necesario para el método de pago activo del tenant que el usuario ya está reservando, en vez de dejar la tabla entera con `select` público; como mínimo evaluar si el RUT necesita estar expuesto públicamente.

### 4.2 RPC de fidelidad pública — **Alto**, ver detalle en §3-bis.

### 4.3 Ficha de cliente compartida por todo el staff del tenant — **Medio**

`supabase/migrations/0014_customers_and_loyalty.sql:100-105`:
```sql
create policy customers_manage on customers for all
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
```
Y el comentario explícito en `src/features/panel/usePanelClients.js:4-6`: *"Ficha de cliente compartida por todo el equipo del tenant (mismo alcance que servicios/profesionales: catálogo del salón, no 'mis clientes')."* Cualquier profesional autenticado del salón —no solo quien atendió a ese cliente— puede leer nombre, teléfono, email, gasto total e historial de todos los clientes del tenant vía `select('*')`. Es una decisión de producto consciente y documentada, pero contrasta con `supabase/migrations/0017_professional_financial_isolation.sql:1-27`, donde el mismo equipo sí restringió el acceso a `bookings`/montos por profesional. No hay razón legal obvia por la que la ficha de cliente (PII) deba tener un alcance más amplio que los montos de la reserva.

### 4.4 Over-fetching general — **Bajo/Medio**

Varios hooks usan `select('*')` sobre tablas donde el frontend solo pinta un subconjunto de columnas (`src/features/panel/usePanelAvailability.js:11-12,43-44`, `src/pages/panel/PanelPayments.jsx:24-25`, `src/pages/panel/PanelStations.jsx:25`). En estos casos el dato es operativo del propio panel autenticado (disponibilidad, estaciones, medios de pago), no PII de clientes de terceros, por lo que el riesgo de proporcionalidad es bajo — pero conviene evitar el patrón `select('*')` por higiene, ya que facilita que un cambio de esquema exponga columnas nuevas sin revisión.

---

## 5. Seguridad y confidencialidad (arts. 14 bis y 14 quinquies)

**Riesgo: Alto** (por Evolution API) / **Bajo** en el resto.

- **Positivo:** los secretos server-side (Stripe, Resend, Evolution API key, Google Places API key) están correctamente confinados a `supabase/functions/.env` (no versionado — confirmado con `git ls-files`, solo `.env.example` está en el repo) y se leen vía `Deno.env.get(...)` en las Edge Functions (`supabase/functions/_shared/evolutionClient.ts:3-4`, `_shared/stripeClient.ts`). La única API key expuesta al navegador es `VITE_GOOGLE_MAPS_API_KEY`, y el propio `.env.example` (líneas de comentario) documenta correctamente que esa sí debe restringirse por HTTP referrer en Google Cloud Console porque es pública por diseño.
- **Positivo:** no hay captura de número de tarjeta en el frontend; el pago "online" delega en Stripe Checkout hospedado (`supabase/functions/create-checkout-session/index.ts`), reduciendo alcance de PCI-DSS y de datos sensibles de pago en el propio código.
- **Alto — `docker/evolution-api/docker-compose.yml`** (versionado en git, confirmado con `git ls-files`):
  - Línea 57: `AUTHENTICATION_API_KEY: nico` — API key trivial, hardcodeada y en control de versiones, que protege el bridge de WhatsApp de todos los tenants.
  - Línea 19: `POSTGRES_PASSWORD: evolution` — credencial por defecto para la base de datos que guarda las conversaciones.
  - Líneas 46-50: `DATABASE_SAVE_DATA_INSTANCE/NEW_MESSAGE/CONTACTS/CHATS: "true"` — Evolution API persiste el **contenido completo de mensajes, contactos y chats de WhatsApp** de clientes en una base Postgres separada de Supabase, sin política de retención visible.
  - Línea 33: el puerto `8080` queda expuesto al host sin capa adicional de auth más allá de esa API key débil.
  - El propio comentario del archivo (línea 1) dice "para desarrollo local", pero al no haber un compose de producción distinto en el repo, existe riesgo real de que estas credenciales por defecto lleguen a producción sin cambiarse.
- No se detectaron mecanismos de detección de accesos anómalos (rate limiting, alertas, WAF) en el código revisado — ni a nivel de Supabase (RLS no sustituye monitoreo) ni de las Edge Functions.

**Recomendación:** rotar y sacar del repo la API key y contraseñas de Evolution API (usar `.env`/secret manager también para ese docker-compose), y definir explícitamente una configuración de producción separada de la de desarrollo.

---

## 6. Reporte de vulneraciones (art. 14 sexies)

**Riesgo: Medio**

- No existe ningún proceso, runbook ni registro (ni siquiera un documento manual) en el repositorio para detectar o documentar una brecha de seguridad. No hay logging centralizado de accesos; los `console.log`/`console.error` encontrados en `supabase/functions/*` (p. ej. `send-notification/index.ts:62,105,117,122`) son de depuración operativa (éxito/fracaso de envío de notificaciones), no un registro de seguridad, y no persisten en una tabla propia.
- No hay tabla ni documento donde se dejaría constancia de: naturaleza de la vulneración, categorías de datos afectados, número de titulares, medidas adoptadas — obligatorio llevar según art. 14 sexies inciso 2, independientemente de si ocurre o no una brecha.
- La combinación con el hallazgo §5 (Evolution API con credenciales débiles versionadas) hace que este punto no sea meramente teórico.

**Recomendación:** crear una plantilla/documento interno (aunque sea una hoja de cálculo) para registrar incidentes, y definir un responsable de detectarlos y notificarlos, como paso previo a cualquier automatización.

---

## 7. Datos de niños, niñas y adolescentes (art. 16 quáter)

**Riesgo: Medio**

- No existe ningún campo de edad/fecha de nacimiento ni verificación de mayoría de edad en `StepForm.jsx` (booking) ni en `Signup.jsx` (registro de tenant) — búsqueda de `menor|edad|birthdate|parental` sobre `src`/`supabase` → 0 resultados.
- Esto significa que la app **no bloquea ni distingue** el registro/reserva de un menor de 14 años sin consentimiento de un adulto responsable (infracción grave potencial, art. 34 ter letra g, si llegara a ocurrir en la práctica), y tampoco aplica ningún resguardo diferenciado para adolescentes de 14-18 años.
- El riesgo es "medio" y no "alto" porque el caso de uso (reservar un corte de pelo/servicio) no está dirigido específicamente a menores ni recolecta datos sensibles de ellos por diseño — pero el campo libre "Notas" (`StepForm.jsx:52-60`) sí podría terminar conteniendo datos sensibles de un menor sin ningún resguardo.

**Recomendación:** agregar una declaración simple ("Esta reserva la hace un adulto responsable" o similar) en el flujo, y evaluar si el negocio necesita distinguir reservas hechas para/por menores.

---

## 8. Geolocalización (art. 16 sexies)

**Riesgo: Bajo / no aplica en su forma actual**

- La app **no usa `navigator.geolocation` ni pide ubicación del usuario** en ningún punto revisado. `src/components/LocationMap.jsx:1-62` solo renderiza un mapa Leaflet estático centrado en la dirección fija del local (`lat/lng` que carga el propio dueño del tenant, no la del cliente), y `src/lib/mapLinks.js:1-26` genera links de navegación externa (Waze/Google/Apple Maps) usando la **dirección de texto del local**, no coordenadas del usuario.
- No es una app de delivery: no hay un flujo que capture ni comparta la ubicación del cliente con un tercero.
- La única pieza de geolocalización relacionada con terceros es el geocoding de la dirección del propio local (`supabase/functions/geocode-address/index.ts`, migración `0033_tenant_geocode.sql`) para posicionar el mapa — eso es dato del negocio, no del titular/cliente final.

**Recomendación:** ninguna acción requerida mientras no se agregue un flujo de delivery/ubicación en tiempo real del cliente; si se agrega en el futuro, ese es el momento de aplicar el art. 16 sexies.

---

## 9. Cesión de datos a terceros (art. 15)

**Riesgo: Medio**

Terceros que reciben datos personales de clientes o del tenant, sin que exista ningún aviso ni consentimiento específico de cesión (coherente con la ausencia total de política de privacidad, §3):

| Tercero | Qué recibe | Dónde |
|---|---|---|
| **Supabase/Google Cloud** (infraestructura) | Todos los datos personales de la app | `src/lib/supabaseClient.js`, todo el backend |
| **Stripe** | Nombre del tenant/negocio, email del dueño, metadata | `supabase/functions/create-checkout-session/index.ts:66-69`, `stripe-webhook/index.ts` |
| **Resend** (email transaccional) | Nombre, email y detalle de la reserva del cliente final | `supabase/functions/_shared/notifications/EmailProvider.ts`, migración `0027_email_notifications.sql` |
| **Evolution API / WhatsApp** (self-hosted, pero con retención de mensajes — ver §5) | Nombre, teléfono y detalle de la reserva del cliente final | `supabase/functions/_shared/evolutionClient.ts`, migraciones `0025/0026_whatsapp_*.sql` |
| **Google Places API** | Nombre/dirección del negocio (no datos de clientes finales) | `supabase/functions/refresh-google-ratings/index.ts` |
| **n8n** (orquestador de WhatsApp) | Mensajes entrantes/salientes de clientes | `n8n/workflows/agenda-whatsapp-entrada.json`, `agenda-whatsapp-salientes.json` |

Como no se recaba consentimiento específico en ningún punto (§1), técnicamente ninguna de estas cesiones cuenta hoy con la base del art. 15 inciso 2 — sería necesario informarlas explícitamente (aunque sea dentro de una política de privacidad general que las liste, ya que son cesiones necesarias para prestar el servicio contratado).

**Recomendación:** listar estos terceros y su finalidad en la política de privacidad (§3), lo que en la mayoría de los casos basta para cesiones necesarias para ejecutar el contrato — no necesariamente requiere un consentimiento separado si se enmarca correctamente como parte de la prestación del servicio.

---

## 10. Retención y eliminación de datos (art. 3 letra c)

**Riesgo: Medio**

- No se encontró ningún job, cron ni lógica de purga para datos con antigüedad definida. Búsqueda de `purge|retention|ttl|expira|delete from` en `supabase/migrations` y `supabase/functions` → el único `delete` encontrado es puntual y no relacionado con retención: `supabase/migrations/0027_email_notifications.sql:69` borra un recordatorio de cola cuando la reserva cambia de estado, no un borrado programado por antigüedad.
- **`customers`** (migración `0014`): se conserva indefinidamente, incluso si el cliente no vuelve a reservar nunca más — no hay campo ni proceso de "cuenta inactiva" que la marque para revisión o borrado.
- **`bookings`, `booking_items`, `booking_status_history`, `reviews`**: sin límite de retención definido.
- **`notification_queue`**: solo se borra el registro puntual de un recordatorio cancelado (ver arriba), el resto de la cola no tiene TTL.
- El único cron existente en el repo (`0032_refresh_google_ratings_cron.sql`) es para refrescar ratings de Google, no para limpieza de datos.

**Recomendación:** definir un plazo de conservación para `customers`/`bookings` (p. ej. tantos años tras la última visita) y documentarlo en la política de privacidad; agregar un job periódico que anonimice o elimine registros que superen ese plazo.

---

## Notas metodológicas

- Auditoría de código estático únicamente: no se ejecutó la app, no se hicieron llamadas reales a la API de Supabase/PostgREST para confirmar en runtime que `tenant_bank_accounts` y `lookup_customer_tier` son alcanzables sin autenticación — la conclusión se basa en la lectura directa de las políticas RLS y los `grant` en las migraciones SQL, que son la fuente de verdad de esos permisos.
- No se revisó el contenido de `supabase/tests/` ni si existen tests que ya cubran (o contradigan) alguno de estos hallazgos.
- Los artículos citados siguen la numeración entregada en la solicitud original; verificar contra el texto oficial de la Ley 21.719 antes de citarlos en un documento legal.

**No se implementó ningún cambio.** Este documento es solo diagnóstico, como se solicitó.
