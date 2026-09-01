# Auditoría de seguridad y cumplimiento — SaaS de agendamiento multi-tenant

**Proyecto:** `agenda2` — React 19 + Vite, Supabase/PostgreSQL (RLS) + Edge Functions (Deno), Stripe (suscripción SaaS), Resend (email), Evolution API/n8n (WhatsApp).
**Fecha:** 2026-08-31.

> **Nota sobre `/security-review`:** se ejecutó como pidió el punto 8. El diff contra `origin/main` está vacío — el working tree solo tiene un archivo untracked nuevo (`docs/`, markdown, excluido por las reglas de esa revisión) y `stripe.exe` (binario, no es código). No hay commits nuevos que auditar por diff, así que esa herramienta no aportó hallazgos de código; todo lo de este informe viene de la lectura directa del esquema, las RLS, las Edge Functions y el frontend. `/claude-security` no existe como skill disponible en este entorno — no pude ejecutarlo.

## Resumen ejecutivo (ordenado de mayor a menor riesgo)

| # | Hallazgo | Tabla/archivo | Riesgo |
|---|---|---|---|
| 1 | "Pago online" no está conectado a ninguna pasarela real: el cliente ve "Pagar $X" y la reserva se crea igual, sin cobrar ni validar nada | `StepPay.jsx`, `create-booking/index.ts`, `payment_transactions` (sin uso) | **Alto** |
| 2 | Cuenta bancaria del salón (N° de cuenta, RUT) legible públicamente sin login vía API REST | `0006_bank_accounts_public_read.sql` | **Alto** |
| 3 | RPC pública `lookup_customer_tier` permite a cualquier anónimo consultar si un teléfono es cliente de un tenant y su nivel de fidelidad | `0035_professional_loyalty_tiers.sql:163-189` | **Alto** |
| 4 | Credenciales hardcodeadas y débiles en `docker-compose.yml` versionado (Evolution API/WhatsApp), que además guarda mensajes/contactos completos de clientes | `docker/evolution-api/docker-compose.yml` | **Alto** |
| 5 | Ficha de cliente (`customers`) visible para todo el staff del tenant, no solo para quien atendió a ese cliente | `0014_customers_and_loyalty.sql:100-105`, `usePanelClients.js` | **Medio** |
| 6 | Sin contrato/términos que declaren el rol del SaaS como encargado de tratamiento de los datos de los clientes finales de cada salón | — (no existe) | **Medio** |
| 7 | Datos de clientes de un salón se conservan indefinidamente tras cancelar la suscripción — no hay purga ni anonimización | `stripe-webhook/index.ts:62-67`, tablas `customers`/`bookings` | **Medio** |
| 8 | Sin distinción de consentimiento entre notificación transaccional (confirmación de cita) y eventual uso de marketing | flujo de reserva completo | **Medio** |
| 9 | Sin rate-limiting visible en endpoints públicos sensibles (`signup-tenant`, `lookup_customer_tier`, `create-booking`) | Edge Functions públicas | **Medio** |
| 10 | Algunas tablas de configuración de tenant (`categories`, `notification_queue`) son editables por cualquier profesional, no solo por el admin | `0002_rls.sql` (sin override posterior) | **Bajo** |
| 11 | Aislamiento entre tenants (RLS) | — | **Positivo — sin hallazgos** |
| 12 | Uso de `service_role` key en frontend | — | **Positivo — no se encontró** |
| 13 | Doble agendamiento / reservas fuera de horario o en el pasado | — | **Positivo — bloqueado a nivel de DB y de motor de slots** |
| 14 | Claims de tenant/rol en el JWT manipulables por el cliente | — | **Positivo — no aplica, se derivan server-side de `auth.uid()`** |
| 15 | Webhook de Stripe (suscripción SaaS) sin validar firma | — | **Positivo — sí valida** |

---

## 1. Aislamiento entre tenants

**Riesgo: sin hallazgos — diseño sólido.**

- Se inventariaron las 18 tablas del esquema (`create table` en `supabase/migrations/*.sql`) que tienen `tenant_id` o dependen de una fila que lo tiene: `tenants, tenant_bank_accounts, tenant_payment_methods, categories, services, professionals, professional_services*, availability_blocks, availability_exceptions, bookings, booking_items, booking_status_history, stations, payment_transactions, notification_queue, customers, reviews, tenant_link_views, professional_loyalty_tiers`. **Todas** tienen `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` (`0002_rls.sql:10-24`, `0014:100`, `0015:41`, `0016:13`, `0035:20`). No se encontró ninguna tabla con datos de negocio/clientes/pagos sin RLS habilitado. (`professional_services` fue reemplazada por columna directa en `services` en `0020_professional_owned_services.sql:68` — ya no existe como tabla).
- Las políticas que sí filtran por tenant lo hacen consistentemente contra `current_tenant_id()`, nunca contra un valor que mande el cliente. Esa función (`0001_schema.sql:278-281`) resuelve el tenant **server-side** re-consultando `professionals` por `auth_user_id = auth.uid()` — no depende de ningún claim del JWT que el cliente pueda manipular.
- Las políticas `using (true)` encontradas (`0002_rls.sql:27,30,34,39,44,49`; `0006:7`; `0015:42`; `0035:23`) son todas de **lectura** sobre catálogo público intencional (nombre del salón, servicios, profesionales, reseñas) — no de escritura, y no exponen datos de otros tenants entre sí (cada fila sigue teniendo su propio `tenant_id`, simplemente cualquiera puede leer cualquier tenant, lo cual es el comportamiento esperado de una landing pública multi-tenant). La única política `using (true)` que sí es un problema de **exposición de datos personales** (no de aislamiento entre tenants) es `tenant_bank_accounts_public_read` — ver hallazgo #2 más abajo.
- No se encontró ninguna función `SECURITY DEFINER` que reciba un `tenant_id` o `professional_id` del cliente y lo use sin validar que ese id pertenece al tenant/usuario que llama. `create_booking`, `lookup_customer_tier`, `panel_month_summary`, `panel_period_metrics`, `panel_team_ranking` (`0008/0012/0014/0016/0035`) todas resuelven el tenant/rol real vía `current_tenant_id()`/`current_professional_role()`, y cuando aceptan un `p_professional_id` explícito (para ver métricas de otro profesional) exigen `current_professional_role() = 'admin'` antes de usarlo (`0012_rbac_team_metrics.sql:22-23,84-85`).
- No se encontró la `service_role` key en ningún archivo de `src/` ni en `index.html`/`vite.config.js` — todas las Edge Functions la usan solo server-side vía `supabaseAdmin()` (`supabase/functions/_shared/supabaseAdmin.ts`), y el frontend solo tiene la `anon` key (`src/lib/supabaseClient.js`, `.env.example`).

**Conclusión:** este es el punto que el propio prompt marca como "el más crítico" y es, con la evidencia revisada, el mejor cubierto del proyecto. No se requiere corrección aquí.

---

## 2. Roles y permisos dentro de cada tenant

**Riesgo: Medio** (por #5 y #10) / resto sin hallazgos.

- **Jerarquía de roles correctamente aplicada donde importa el dinero**: `0017_professional_financial_isolation.sql:19-27` restringe `bookings`/`booking_items`/`booking_status_history`/`payment_transactions` para que un `professional` solo vea/edite **sus propias** reservas (`professional_id = current_professional_id()`), mientras que `admin` sigue viendo todo el tenant. El propio comentario de esa migración (líneas 6-11) documenta que antes cualquier profesional podía leer `total_price_clp` de reservas de sus compañeros vía `supabase.from('bookings').select('*')` directo — es decir, el equipo ya detectó y cerró ese hueco.
- **Escalamiento de privilegios bloqueado con trigger, no solo con RLS**: `0010_admin_role_guards.sql:62-81` (`guard_professional_privileged_fields`) impide que un `professional` cambie su propio `role`, `active` o `tenant_id` aunque la fila sea la suya (RLS por sí sola no puede restringir columnas dentro de un UPDATE permitido).
- **Cliente autenticado / reservas propias**: no aplica tal como está construido el producto — el cliente final **no tiene cuenta** en este sistema (confirmado en `StepForm.jsx:32`: "No necesitas crear cuenta"). El control de "solo mis reservas" se hace vía posesión del `public_token` (UUID aleatorio, imposible de adivinar) en vez de sesión — ver detalle de por qué esto es aceptable en la sección 6.
- **Endpoints que reciben `tenant_id`/`professional_id`/`user_id` del cliente sin validar sesión**: revisadas todas las Edge Functions (`create-booking`, `reschedule-booking`, `schedule-days`, `available-slots`, `invite-professional`, `create-checkout-session`, `geocode-address`, `whatsapp-link`). Ninguna confía en un `tenant_id` recibido en el body/query para autorizar una escritura sensible: `create-booking`/`schedule-days`/`available-slots` reciben `tenantSlug` pero solo lo usan para **leer** catálogo público (igual que hace el frontend sin login) y siempre revalidan que `professionalId`/`serviceIds` pertenecen a ese tenant antes de usarlos (`create-booking/index.ts:74-96`); las funciones que sí escriben datos sensibles del panel (`invite-professional:34-42`, `create-checkout-session:38-46`, `geocode-address`) derivan el `tenant_id` del **JWT del caller** (`auth_user_id = userData.user.id`), nunca de un parámetro del body.
- **#5 — Medio**: `customers_manage` (`0014_customers_and_loyalty.sql:100-105`) solo exige `tenant_id = current_tenant_id()`, sin la misma restricción por profesional que sí se aplicó a `bookings` en 0017. Confirmado explícitamente en el comentario de `src/features/panel/usePanelClients.js:4-6`: *"Ficha de cliente compartida por todo el equipo del tenant... no 'mis clientes'"*. Cualquier `professional` del salón —no solo un `admin`— puede leer nombre, teléfono, email, gasto total e historial de **todos** los clientes del tenant. Es una decisión de producto documentada, no un descuido, pero contrasta con el criterio ya aplicado a `bookings`, y significa que un solo barbero con la cuenta comprometida expone la base de clientes completa del salón, no solo la suya.
- **#10 — Bajo**: `categories_manage*` (`0002_rls.sql:35-37`) y `notification_queue_manage` (`0002_rls.sql:83-84`) nunca recibieron el mismo endurecimiento a `admin` que sí tuvieron `tenant_payment_methods`, `tenant_bank_accounts`, `stations` y `professional_services` en `0010_admin_role_guards.sql`. Cualquier profesional del tenant puede crear/editar/borrar categorías del catálogo público y tocar la cola de notificaciones de otros. Impacto bajo (no es dato personal de terceros ni dinero), pero es una inconsistencia respecto al criterio ya establecido en el propio proyecto.

**Recomendación:** aplicar a `customers` la misma restricción por profesional que ya tiene `bookings` (o, si el negocio de verdad quiere ficha compartida, documentarlo explícitamente como decisión de producto y evaluar si aplica solo a `admin` + el profesional que atendió); alinear `categories`/`notification_queue` con el resto de la configuración de tenant restringida a `admin`.

---

## 3. Pasarela de pago

**Riesgo: Alto** (por #1) / resto positivo.

- **No se almacena número de tarjeta, CVV ni vencimiento en ningún lado** del código revisado — ni en el esquema (`bookings`/`payment_transactions` no tienen esas columnas), ni en el frontend (`StepPay.jsx` no captura esos campos).
- **API keys de pasarela nunca en el frontend**: `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` solo existen en `supabase/functions/.env` (no versionado) y se leen server-side en `stripeClient.ts`/`stripe-webhook/index.ts`. Coherente con el resto del proyecto.
- **Webhook de Stripe valida firma correctamente**: `stripe-webhook/index.ts:22-36` exige el header `stripe-signature` y usa `stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)` sobre el body crudo (no parseado) — esto es exactamente el patrón correcto para evitar eventos falsificados. **Pero ojo**: este webhook es para la **suscripción SaaS del tenant** (lo que le paga el dueño del salón a la plataforma), no para pagos de clientes finales — ver siguiente punto.
- **#1 — Alto, gap real en el pago del cliente final**: el esquema tiene todo preparado para pagos online de clientes (`payment_transactions` con `gateway`, `external_id`, `signature_verified`, `unique(gateway, external_id)` para idempotencia de webhooks — `0001_schema.sql:207-218`; enum `payment_status` con `pagado`/`reembolsado` — línea 11), y el panel deja elegir una pasarela (`PanelPayments.jsx:12`: Mercado Pago, Stripe, Webpay, Khipu) y activar "Pago online". **Pero no existe ninguna Edge Function que efectivamente cobre ni reciba un webhook de esas pasarelas** (se revisó el listado completo de `supabase/functions/` — no hay `webpay-webhook`, `mercadopago-webhook`, ni una llamada a ninguna de esas APIs). El flujo real: `StepPay.jsx:111-121` muestra un botón "Pagar $X" que, al hacer clic, llama a `submitBooking` → `createBooking(...)` (`BookingWizard.jsx`, `src/lib/api.js:54-56`) — **exactamente la misma llamada que "efectivo" o "transferencia"**, sin redirigir a ninguna pasarela ni cobrar nada. La reserva se crea igual, con `payment_status = 'pendiente'` (default de la tabla) y sin ningún registro en `payment_transactions`.
  - **Impacto de negocio real**: si un salón activa "Pago online" pensando que está cobrando por adelantado, el cliente ve un botón que dice "Pagar" y una reserva "confirmada", pero **el salón nunca recibe el dinero** y no hay ningún registro de que se intentó cobrar — un no-show le cuesta la hora completa al salón sin que exista ni siquiera el intento de cobro que el producto promete.
  - **Impacto de seguridad**: no hay superficie de ataque de "firma de webhook falsa" simplemente porque no hay webhook — el riesgo aquí es de integridad de negocio, no de intrusión, pero como el prompt pregunta explícitamente "¿se confirma la reserva solo cuando el webhook confirma el pago?" la respuesta es: **no hay webhook que confirme nada, se confirma siempre**.
- La confirmación de pago para **efectivo/transferencia** sí es coherente con el modelo de negocio (pago presencial/manual, no requiere webhook).

**Recomendación:** o se completa la integración real de la pasarela elegida (Edge Function que cree la sesión de pago + webhook que valide firma antes de marcar `payment_status = 'pagado'`), o se oculta la opción "Pago online" del panel hasta que exista, para no prometerle al cliente final una garantía de cobro que hoy no existe.

---

## 4. Lógica de reservas (integridad del negocio)

**Riesgo: sin hallazgos — bien resuelto tanto en frontend como (sobre todo) en base de datos.**

- **Doble agendamiento bloqueado a nivel de Postgres, no solo en el frontend**: `bookings` tiene un `exclude using gist (professional_id with =, blocked_range with &&) where (status <> 'cancelada')` (`0001_schema.sql:166-168`, con `create extension btree_gist` en la línea 6). Esto es una garantía real de base de datos: aunque dos requests concurrentes pasen la validación de disponibilidad de la app al mismo tiempo, Postgres rechaza el segundo INSERT con `23P01` (`exclusion_violation`). `create-booking/index.ts:13,147-182` y `reschedule-booking/index.ts:13,76-86` capturan ese código específico y reintentan con el siguiente profesional candidato o devuelven 409 — el flujo está diseñado explícitamente alrededor de esta garantía, no como un afterthought.
- **No se puede reservar en el pasado o fuera de horario manipulando el payload**: `create-booking`/`reschedule-booking` nunca insertan directamente el `startMinute` que manda el cliente — primero recalculan los slots realmente disponibles server-side con `computeAvailableSlots` (`supabase/functions/_shared/slotEngine.ts`), que descarta cualquier slot anterior a `now + minLeadTimeMin` (línea 153,173) y cualquiera fuera de los bloques de disponibilidad/excepciones del profesional (`effectiveWindowsForDate`, líneas 93-115). Solo si el `startMinute` pedido coincide exactamente con uno de esos slots recalculados se procede al insert (`create-booking/index.ts:144-145`, `reschedule-booking/index.ts:72-73`). Un payload manipulado que pida una hora pasada o fuera de horario simplemente no encuentra `match` y la función responde 409/"no está disponible".
- **Cancelación/reprogramación validan ownership**: ambas operan exclusivamente sobre `public_token` (UUID v4 aleatorio, único, no secuencial — `bookings.public_token`, `0001_schema.sql:161`), nunca sobre un `booking_id` correlativo adivinable. No hay forma de cancelar/reagendar la reserva de otra persona sin conocer su token, que solo se comparte en el propio link de confirmación de esa reserva.

---

## 5. Datos personales y Ley 21.719 en modelo B2B2C

**Riesgo: Medio.**

- **#6 — sin contrato de encargo de tratamiento**: no se encontró ningún archivo de términos de servicio, contrato o cláusula que declare el rol del SaaS `agenda2` frente a cada salón-tenant respecto de los datos de los clientes finales de ese salón. El art. 15 bis (según lo descrito en la solicitud) exige que ese encargo conste por escrito con objeto, duración, tipo de datos y obligaciones — hoy no existe ese documento en el repo ni una pantalla de aceptación en `Signup.jsx`.
- **Derechos ARCOP del cliente final de cada salón**: no existe ningún canal directo en la app (confirmado igual que en la auditoría anterior: sin formulario, sin correo dedicado). El único mecanismo indirecto es contactar al salón por WhatsApp/teléfono, fuera de la plataforma — no hay garantía de que cada salón sepa que debe responder esas solicitudes dentro de plazo, precisamente porque no hay contrato (#6) que se lo indique.
- **Consentimiento diferenciado para el uso de los datos (#8)**: al agendar, `StepForm.jsx` solo dice *"Te enviamos la confirmación por WhatsApp y email"* (línea 32) — es una notificación transaccional razonable sin checkbox aparte, lo cual es defendible como necesario para el contrato. El riesgo aparece si en el futuro se reutiliza ese mismo teléfono/email para marketing del salón (recordatorios promocionales, no solo transaccionales) sin pedir un consentimiento separado — hoy el código no hace eso, pero tampoco hay ninguna barrera que lo impida ni un campo que distinga "contacto transaccional" de "contacto de marketing".
- **#7 — retención tras cancelar la suscripción**: `stripe-webhook/index.ts:62-67` (`customer.subscription.deleted`) solo actualiza `tenants.subscription_status = 'canceled'` — no se encontró ningún trigger, cron ni proceso que borre o anonimice los datos de `customers`/`bookings` de ese tenant después de la cancelación. Los datos de los clientes finales de un salón que dejó de pagar quedan en la base indefinidamente.

**Recomendación:** redactar un contrato/términos mínimos que declaren el rol de encargado de tratamiento frente a cada salón; definir y documentar un plazo de retención tras cancelación (p. ej. purga a los N meses); si se planea marketing a futuro, separar explícitamente ese consentimiento del transaccional desde ya en el modelo de datos.

---

## 6. Autenticación y sesiones

**Riesgo: sin hallazgos.**

- **El tenant/rol NO viaja como claim del JWT** — y eso es más seguro que la alternativa, no menos: `current_tenant_id()`, `current_professional_id()` y `current_professional_role()` (`0001_schema.sql:278-291`) son funciones `SECURITY DEFINER` que en cada llamada re-consultan la tabla `professionals` filtrando por `auth_user_id = auth.uid()` (donde `auth.uid()` viene de la firma verificada del JWT de Supabase Auth, no de un campo que el cliente pueda setear). Esto es inmune a manipulación de claims porque no hay claims de negocio que manipular — el único dato que el cliente controla es su identidad de auth, y el tenant/rol se resuelve siempre del lado del servidor a partir de esa identidad.
- **Invitación de staff**: `invite-professional/index.ts` exige JWT válido + `role === 'admin'` del tenant activo (líneas 34-42) antes de crear el `auth.user` (vía `db.auth.admin.inviteUserByEmail`, que dispara el flujo de invitación oficial de Supabase Auth — el invitado debe aceptar el correo y fijar su propia contraseña, no hay contraseña temporal ni auto-aceptación). El `tenant_id` de la nueva fila en `professionals` (línea 57) se toma siempre de `caller.tenant_id`, nunca de un valor que mande el body — no hay forma de que la invitación cree un profesional en un tenant distinto al del admin que invita.
- **Self-signup** (`signup-tenant/index.ts`) es intencionalmente público (no hay sesión previa que verificar) y usa una lista de slugs reservados (`RESERVED_SLUGS`, líneas 16-20) para evitar que alguien tome rutas como `/panel` o `/admin` como slug de su salón; valida unicidad de slug antes y después de la transacción (líneas 60-62, 87-89) y revierte el `auth.user` creado si la transacción de `create_tenant_with_owner` falla (línea 86), evitando cuentas huérfanas. No se encontró rate-limiting propio sobre este endpoint (ver #9), aunque Supabase Auth aplica algunos límites por defecto a nivel de plataforma sobre `auth.admin.createUser`.

---

## 7. Exposición de datos en el frontend

**Riesgo: Bajo**, salvo lo ya cubierto en otras secciones.

- No se encontró ningún `console.log`/`console.error`/`console.warn` en todo `src/` — cero superficie de fuga de datos por consola del navegador.
- Se revisaron los hooks de agenda/calendario del panel (`usePanelAppointments.js`, `usePanelAvailability.js`) y todos filtran explícitamente por `tenant_id`/`professional_id` en la query — no se detectó ningún `select` que traiga reservas de otro salón o, salvo el caso ya cubierto en §2 (`customers`), de otro profesional del mismo salón sin que la UI lo muestre.
- Patrón `select('*')` presente en varios hooks (`usePanelAvailability.js:11-12,43-44`, `PanelPayments.jsx:24-25`, `PanelStations.jsx:25`, `usePanelClients.js:15`) — over-fetching de columnas dentro de datos que el usuario ya está autorizado a ver (RLS ya los filtra por tenant/rol), así que el riesgo no es de fuga entre tenants, sino de higiene: un cambio de esquema futuro que agregue una columna sensible a esas tablas quedaría expuesto sin que nadie lo note en el código. No requiere acción urgente, pero es buena práctica migrar a `select` explícito.
- Los errores devueltos al cliente por las Edge Functions (`errorResponse(err.message, ...)`) en general son mensajes de negocio ("no está disponible", "ese link ya está en uso"), no volcados crudos de error de Postgres con nombres de tabla/columna — no se detectó un caso donde un error interno completo se reenvíe tal cual al navegador.

---

## 8. Seguridad general (complementaria)

- **`/security-review` sobre el diff**: ejecutado, diff vacío (ver nota al inicio del documento) — no aplicable sin cambios de código pendientes.
- **`/claude-security`**: no existe como skill/comando en este entorno, no se pudo ejecutar.
- **#4 — Alto**: `docker/evolution-api/docker-compose.yml` (versionado en git, confirmado con `git ls-files`) tiene `AUTHENTICATION_API_KEY: nico` (línea 57) y `POSTGRES_PASSWORD: evolution` (línea 19) hardcodeados — credenciales triviales para el bridge de WhatsApp y su base de datos, en control de versiones. Ese mismo contenedor persiste mensajes, contactos y chats completos de los clientes finales (`DATABASE_SAVE_DATA_NEW_MESSAGE/CONTACTS/CHATS: "true"`, líneas 47-50) en una base Postgres separada de Supabase, con el puerto expuesto al host (línea 33). El comentario del archivo dice "desarrollo local", pero no existe en el repo una configuración de producción distinta — si estas credenciales llegan a producción sin cambiar, cualquiera que alcance el puerto 8080 con esa API key trivial controla el WhatsApp Business de todos los salones y accede al historial completo de conversaciones con clientes.
- **#9 — Medio**: no se encontró ningún mecanismo de rate-limiting propio (a nivel de Edge Function o de Postgres) en los endpoints públicos más sensibles a abuso: `signup-tenant` (creación de cuentas), `lookup_customer_tier` (oráculo de PII por teléfono, ver #3), `create-booking` (podría usarse para saturar la agenda de un profesional con reservas basura, aunque el `exclusion constraint` limita el daño a "una reserva por slot"). Puede haber límites por defecto de la plataforma Supabase, pero no hay nada explícito en el código del proyecto.

---

## Notas metodológicas

- Auditoría de código estático: se leyeron directamente las 36 migraciones SQL, las 20 Edge Functions y los hooks/páginas relevantes del frontend. No se ejecutó la app ni se hicieron llamadas reales a la API para confirmar en runtime los hallazgos de exposición pública (#2, #3) — la conclusión se basa en los `CREATE POLICY`/`GRANT` de las migraciones, que son la fuente de verdad de esos permisos en Supabase/PostgREST.
- No se revisó `supabase/tests/` para ver si ya existen tests que cubran (o contradigan) alguno de estos hallazgos.
- **No se implementó ningún cambio.** Este documento es solo diagnóstico, como se solicitó. El propio pedido marca el orden de corrección: aislamiento entre tenants primero — en este caso no hay hallazgos ahí, así que el punto de partida natural sería **#1 (pago online no funcional)** por impacto de negocio directo, o **#2/#3 (exposición pública de datos bancarios y de clientes)** por impacto de privacidad, según qué priorices.
