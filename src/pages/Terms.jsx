import { Link } from 'react-router-dom';

// Términos del servicio + Anexo A (encargado de tratamiento). Cubre el hallazgo #6 de
// docs/auditoria-seguridad-multitenant.md: hasta ahora existía la política de privacidad (que le
// habla al cliente final del salón) pero no el contrato con el salón, que es quien paga y quien es
// el responsable legal de los datos de sus propios clientes.
//
// El Anexo A no es adorno: la Ley 21.719 exige que la relación responsable-encargado esté por
// escrito. Sin él, en un incidente la discusión sobre quién notifica y en qué plazo se empieza de
// cero, y cada salón que exija un contrato de tratamiento (los que vienen de una cadena lo hacen)
// queda bloqueado en la venta.

const CONTACT_EMAIL = 'privacidad@agenda.app';
const LAST_UPDATED = '10 de septiembre de 2026';

export default function Terms() {
  return (
    <div className="min-h-screen bg-[#F1F2F5] px-4 py-10">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 rounded-[20px] border border-[#E2E5EC] bg-white p-7 sm:p-10">
        <div>
          <Link to="/" className="text-[12.5px] font-semibold text-[#4F46E5]">
            ← Volver
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[#0F172A]">Términos del servicio</h1>
          <p className="mt-1.5 text-[12.5px] text-[#64748B]">Última actualización: {LAST_UPDATED}</p>
          <p className="mt-3 text-[13px] leading-[1.6] text-[#475569]">
            Estos términos regulan el uso de <strong>Agenda SaaS</strong> por parte de los negocios que contratan la plataforma. Si
            llegaste acá porque vas a reservar una hora en un salón, lo que te aplica es la{' '}
            <Link to="/privacidad" className="font-semibold text-[#4F46E5]">
              política de privacidad
            </Link>
            : el contrato de reserva lo tienes con el negocio, no con nosotros.
          </p>
        </div>

        <Section title="1. Quiénes somos y qué contratas">
          <p>
            <strong>Agenda SaaS</strong> es una plataforma en línea que permite a salones, barberías y negocios similares (en
            adelante, <strong>el negocio</strong>) publicar su disponibilidad, recibir reservas de sus clientes y administrar su
            agenda, su equipo y sus servicios.
          </p>
          <p>
            Al crear una cuenta aceptas estos términos. Si lo haces en representación de un negocio, declaras que tienes facultades
            para obligarlo.
          </p>
        </Section>

        <Section title="2. La cuenta del negocio">
          <p>
            Eres responsable de la veracidad de los datos de tu negocio, de mantener la confidencialidad de tus credenciales y de
            la actividad que ocurra bajo tu cuenta y la de los profesionales que invites.
          </p>
          <p>
            Cada profesional que agregues accede solo a su propia agenda, sus servicios y los clientes que ha atendido. El rol de
            administrador ve además la información consolidada del negocio. Dar de baja a un profesional es responsabilidad del
            administrador.
          </p>
        </Section>

        <Section title="3. Prueba, suscripción y pagos">
          <p>
            El servicio se ofrece con un período de prueba gratuito. Terminada la prueba, el acceso al panel requiere una
            suscripción vigente. La página pública de reservas del negocio sigue funcionando durante los procesos de cobro fallido
            y su período de gracia.
          </p>
          <p>
            Los pagos de la suscripción se procesan a través de Stripe. No almacenamos números de tarjeta en nuestros servidores.
            La suscripción se renueva automáticamente hasta que la canceles; la cancelación surte efecto al término del período ya
            pagado y no genera devoluciones proporcionales, salvo que la ley lo exija.
          </p>
          <p>
            Los precios pueden cambiar. Cualquier cambio se avisa con al menos 30 días de anticipación al correo registrado y
            aplica recién en la renovación siguiente.
          </p>
        </Section>

        <Section title="4. Qué hace y qué no hace la plataforma">
          <p>
            Agenda SaaS provee la herramienta de agendamiento. <strong>No</strong> es parte del contrato entre el negocio y sus
            clientes finales: la prestación del servicio, su precio, el cobro, las boletas, las promociones y las políticas de
            cancelación o no-show son responsabilidad exclusiva del negocio.
          </p>
          <p>
            El método de pago que el negocio habilita en su página de reservas (efectivo, transferencia u otros) indica cómo se
            pagará el servicio <em>en el local</em>. Cualquier cobro anticipado o abono que el negocio acuerde con su cliente se
            gestiona fuera de la plataforma, salvo que se indique expresamente lo contrario.
          </p>
        </Section>

        <Section title="5. Obligaciones del negocio">
          <p>Al usar la plataforma te comprometes a:</p>
          <ul className="ml-4 list-disc space-y-1">
            <li>Usarla solo para gestionar tu propia actividad comercial lícita.</li>
            <li>
              Ser el <strong>responsable</strong> del tratamiento de los datos personales de tus clientes: informarles, tomar el
              consentimiento cuando corresponda y atender sus solicitudes de acceso, rectificación, cancelación, oposición,
              portabilidad y bloqueo. La plataforma te da las herramientas; la obligación legal es tuya.
            </li>
            <li>
              No cargar datos de terceros sin fundamento para hacerlo, ni usar los datos de tus clientes para fines distintos de
              los que les informaste (por ejemplo, marketing sin consentimiento específico).
            </li>
            <li>No intentar acceder a datos de otros negocios de la plataforma, ni evadir las restricciones técnicas del servicio.</li>
          </ul>
        </Section>

        <Section title="6. Disponibilidad y soporte">
          <p>
            Trabajamos para mantener el servicio disponible de forma continua, pero no se ofrece garantía de disponibilidad
            ininterrumpida. Podemos realizar mantenimientos programados, avisando con anticipación razonable cuando impliquen
            interrupción.
          </p>
          <p>
            El soporte se presta por correo a <strong>{CONTACT_EMAIL}</strong> en días hábiles. Los incidentes que dejan el
            servicio inoperativo tienen prioridad sobre las consultas de uso.
          </p>
        </Section>

        <Section title="7. Tus datos son tuyos">
          <p>
            La información que cargas y la que generan tus clientes al reservar (servicios, horarios, fichas de clientes,
            historial de citas) te pertenece. No la vendemos, no la cedemos a terceros con fines comerciales y no la usamos para
            perfilar a tus clientes.
          </p>
          <p>
            Puedes exportar tus datos en formato CSV desde <strong>Ajustes del salón</strong> en cualquier momento, incluso si tu
            suscripción ya venció. Tras la cancelación definitiva mantenemos los datos por un plazo acotado para permitir la
            recuperación de la cuenta, y luego se eliminan o anonimizan según los plazos descritos en la política de privacidad.
          </p>
        </Section>

        <Section title="8. Suspensión y término">
          <p>
            Puedes cancelar cuando quieras desde el panel. Podemos suspender o terminar una cuenta en caso de falta de pago
            persistente, uso ilícito de la plataforma o riesgo para la seguridad de los datos de terceros; salvo urgencia o
            prohibición legal, avisamos antes y damos oportunidad de corregir.
          </p>
        </Section>

        <Section title="9. Responsabilidad">
          <p>
            El servicio se entrega "tal cual". En la medida que la ley lo permita, nuestra responsabilidad total frente a
            cualquier reclamo relacionado con el servicio se limita a lo que hayas pagado por él en los 12 meses anteriores al
            hecho que lo origina. No respondemos por lucro cesante ni por perjuicios indirectos.
          </p>
          <p>Nada de lo anterior limita la responsabilidad que la ley declare irrenunciable, ni la derivada de dolo.</p>
        </Section>

        <Section title="10. Cambios y ley aplicable">
          <p>
            Podemos actualizar estos términos. Los cambios relevantes se avisan al correo registrado con al menos 30 días de
            anticipación; seguir usando el servicio después de esa fecha implica aceptarlos.
          </p>
          <p>
            Estos términos se rigen por la ley chilena. Cualquier controversia se somete a los tribunales ordinarios de justicia
            de Santiago de Chile.
          </p>
        </Section>

        <Section title="11. Contacto">
          <p>
            Escríbenos a <strong>{CONTACT_EMAIL}</strong> por cualquier consulta sobre estos términos, sobre el Anexo A o para
            ejercer derechos sobre tus datos.
          </p>
        </Section>

        <div className="mt-2 border-t border-[#E2E5EC] pt-6">
          <h2 className="text-[17px] font-extrabold tracking-tight text-[#0F172A]">Anexo A · Tratamiento de datos personales</h2>
          <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[#64748B]">
            Este anexo es parte de los términos y regula el tratamiento que Agenda SaaS realiza por cuenta del negocio sobre los
            datos personales de sus clientes finales, conforme a la Ley N° 21.719.
          </p>
        </div>

        <Section title="A.1 Roles">
          <p>
            El <strong>negocio es el responsable</strong>: decide qué datos pide a sus clientes, para qué los usa y por cuánto
            tiempo. <strong>Agenda SaaS es el encargado</strong>: trata esos datos únicamente para operar la plataforma, siguiendo
            las instrucciones del negocio contenidas en estos términos y en la configuración de su cuenta.
          </p>
        </Section>

        <Section title="A.2 Objeto, duración y finalidad">
          <p>
            <strong>Objeto:</strong> alojar y procesar los datos necesarios para gestionar reservas de horas.{' '}
            <strong>Duración:</strong> mientras la cuenta esté vigente, más los plazos de retención del punto A.9.{' '}
            <strong>Finalidad:</strong> agendar, confirmar, recordar, reprogramar y cancelar citas; llevar la ficha de cliente y el
            programa de fidelización que el negocio configure; y emitir las métricas del propio negocio.
          </p>
        </Section>

        <Section title="A.3 Datos y titulares">
          <p>
            <strong>Titulares:</strong> clientes finales del negocio y profesionales de su equipo.{' '}
            <strong>Categorías:</strong> identificación y contacto (nombre, teléfono, correo), datos de la cita (servicio,
            profesional, fecha, precio, notas que el cliente o el profesional escriban) e historial de visitas. No se solicitan
            datos sensibles; el negocio se obliga a no cargarlos en campos de texto libre.
          </p>
        </Section>

        <Section title="A.4 Instrucciones">
          <p>
            Agenda SaaS trata los datos solo según estas instrucciones documentadas. Si una instrucción del negocio pareciera
            infringir la ley, lo informaremos y podremos suspender su ejecución.
          </p>
        </Section>

        <Section title="A.5 Confidencialidad">
          <p>
            El personal con acceso a los datos está sujeto a obligación de confidencialidad. El acceso se otorga solo a quien lo
            necesita para operar o dar soporte al servicio, y queda registrado.
          </p>
        </Section>

        <Section title="A.6 Medidas de seguridad">
          <p>
            Aislamiento de los datos de cada negocio mediante políticas de seguridad a nivel de fila en la base de datos; cifrado
            en tránsito (HTTPS) y en reposo; credenciales de servidor fuera del código del navegador; límites de frecuencia en los
            puntos de acceso públicos; respaldos periódicos; y revisión de las políticas de acceso ante cada cambio de esquema.
          </p>
        </Section>

        <Section title="A.7 Subencargados">
          <p>
            El negocio autoriza el uso de los siguientes proveedores, cada uno con su propio rol acotado:{' '}
            <strong>Supabase</strong> (base de datos y funciones), <strong>Vercel</strong> (alojamiento de la aplicación),{' '}
            <strong>Stripe</strong> (cobro de la suscripción del negocio), <strong>Resend</strong> (envío de correos
            transaccionales) y <strong>Google</strong> (mapa y reseñas del local, cuando el negocio los activa). Informaremos con
            anticipación razonable cualquier incorporación o reemplazo, y el negocio podrá objetarla terminando el servicio sin
            penalidad.
          </p>
        </Section>

        <Section title="A.8 Asistencia al responsable">
          <p>
            Cuando un cliente final ejerza sus derechos ante el negocio, la plataforma le entrega las herramientas para responder:
            la bandeja de solicitudes del panel, la exportación de datos en CSV y la edición o eliminación de las fichas. Si la
            solicitud llega directamente a Agenda SaaS, la derivamos al negocio en lugar de responderla por él.
          </p>
          <p>
            También asistimos al negocio en la evaluación de impacto y en la notificación de incidentes cuando corresponda.
          </p>
        </Section>

        <Section title="A.9 Incidentes de seguridad">
          <p>
            Ante una vulneración que afecte datos personales del negocio, se lo notificaremos <strong>sin dilación indebida y
            dentro de las 48 horas</strong> desde que tomemos conocimiento, indicando la naturaleza del incidente, las categorías y
            el volumen aproximado de datos afectados, las consecuencias probables y las medidas adoptadas. La notificación a la
            autoridad y a los titulares corresponde al negocio, como responsable, con nuestra asistencia.
          </p>
        </Section>

        <Section title="A.10 Devolución y eliminación">
          <p>
            Al terminar el servicio, el negocio puede exportar sus datos desde el panel. Transcurrido el plazo de recuperación
            indicado en la política de privacidad, los datos personales de sus clientes se eliminan o anonimizan de los sistemas
            activos, salvo aquello que debamos conservar por obligación legal.
          </p>
        </Section>

        <Section title="A.11 Auditoría">
          <p>
            A solicitud fundada del negocio, entregaremos la información razonablemente necesaria para acreditar el cumplimiento
            de este anexo. Las auditorías en terreno se coordinan previamente, no pueden afectar la operación ni exponer datos de
            otros negocios de la plataforma.
          </p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-2 text-[13.5px] leading-[1.6] text-[#334155]">
      <h2 className="text-[15px] font-bold text-[#0F172A]">{title}</h2>
      {children}
    </section>
  );
}
