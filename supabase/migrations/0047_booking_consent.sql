-- Evidencia del consentimiento del cliente final al reservar (Ley 21.719, arts. 12 y 13:
-- hallazgo #4 de docs/auditoria-ley-21719.md).
--
-- Hasta ahora el dueño del salón aceptaba la política al registrarse (Signup.jsx) pero el cliente
-- que reserva entregaba nombre, teléfono y correo sin aceptar nada -- y es justamente él el titular
-- de esos datos. No basta con poner el checkbox en el formulario: la ley pide poder *acreditar*
-- que hubo consentimiento, así que queda registrado en la propia reserva.
--
-- Se guarda también la versión de la política aceptada: si mañana cambia el texto, hay que poder
-- responder "esta persona aceptó la versión de tal fecha", no solo "aceptó".
alter table bookings
  add column consent_accepted_at timestamptz,
  add column consent_version text;

comment on column bookings.consent_accepted_at is
  'Momento en que el cliente aceptó la política de privacidad al reservar por la web pública. Null en reservas cargadas desde el panel: ahí el cliente está presente en el local y el consentimiento lo toma el salón por su cuenta (es el responsable de esos datos, ver la política).';
comment on column bookings.consent_version is
  'Versión del texto de política aceptada, para poder acreditar QUÉ se aceptó y no solo que se aceptó.';

-- Sin índice a propósito: estas columnas se consultan de a una reserva puntual (al responder una
-- solicitud ARCOP o un reclamo), nunca en un filtro masivo.
