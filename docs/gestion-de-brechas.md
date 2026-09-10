# Gestión de brechas de seguridad

Runbook interno para cumplir el art. 14 sexies de la Ley 21.719. Aplica a cualquier incidente que
exponga, altere o destruya sin autorización datos personales tratados por Agenda SaaS o por algún
salón (tenant) que opera sobre la plataforma — por ejemplo, credenciales filtradas, una política
RLS mal configurada, o acceso indebido a la base de datos de Evolution API.

## 1. Detectar y contener

- Identifica qué sistema está comprometido (Supabase, Evolution API, cuenta de email, etc.) y
  córtale el acceso de inmediato: rota la credencial/API key afectada, revoca sesiones, o
  desactiva el endpoint si es necesario.
- No borres evidencia (logs, filas afectadas) antes de documentar el alcance.

## 2. Evaluar el alcance

Responde, con la mejor información disponible en ese momento:

- ¿Qué categorías de datos se vieron afectadas? (nombre, teléfono, email, notas, cuenta bancaria,
  mensajes de WhatsApp, credenciales, etc.)
- ¿A cuántos titulares afecta, aproximadamente? ¿De qué tenant(s)?
- ¿Fue una exposición (alguien pudo leer datos que no debía) o una alteración/pérdida?

## 3. Registrar el incidente

Crea una fila en la tabla `security_incidents` (Supabase Studio → Table Editor; esa tabla es de
solo `service_role`, no aparece en ningún panel de tenant a propósito) con como mínimo: la
naturaleza del incidente, categorías de datos afectadas, estimación de titulares afectados, y las
medidas ya tomadas para contenerlo. Esto satisface la obligación de llevar constancia
independientemente de si el incidente termina siendo notificado o no.

## 4. Notificar si corresponde

- **A la Agencia de Protección de Datos Personales**: obligatorio si la brecha genera un riesgo
  razonable para los derechos de los titulares (ej. datos bancarios, credenciales, datos de
  salud). Marca `authority_notified = true` una vez hecho.
- **A los titulares afectados**: obligatorio cuando el riesgo es alto (ej. exposición de la cuenta
  bancaria del negocio o de mensajes de WhatsApp con datos sensibles). Marca
  `subjects_notified = true` una vez hecho.
- Si el incidente afecta a clientes de un tenant específico, avisa también al dueño del salón —
  él es el responsable de esos datos frente a sus propios clientes (ver
  `docs/auditoria-ley-21719.md`, §1).

## 5. Remediar y cerrar

- Aplica el fix definitivo (no solo la contención del paso 1): rotación de credenciales, migración
  de RLS, parche de código, etc.
- Actualiza la fila en `security_incidents` con las medidas tomadas, cambia `status` a `cerrado` y
  completa `closed_at`.

## Quién es responsable

Mientras Agenda SaaS sea operado por una sola persona, esa persona es quien detecta, registra y
decide las notificaciones. Si el equipo crece, este documento debe actualizarse para nombrar un
responsable explícito (rol equivalente a un DPO) y un plazo interno máximo antes de escalar a la
Agencia.
