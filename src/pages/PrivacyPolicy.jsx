import { Link } from 'react-router-dom';

const CONTACT_EMAIL = 'privacidad@agenda.app';
const LAST_UPDATED = '2 de septiembre de 2026';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#F1F2F5] px-4 py-10">
      <div className="mx-auto flex max-w-[720px] flex-col gap-6 rounded-[20px] border border-[#E2E5EC] bg-white p-7 sm:p-10">
        <div>
          <Link to="/" className="text-[12.5px] font-semibold text-[#4F46E5]">
            ← Volver
          </Link>
          <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-[#0F172A]">Política de privacidad</h1>
          <p className="mt-1.5 text-[12.5px] text-[#64748B]">Última actualización: {LAST_UPDATED}</p>
        </div>

        <Section title="1. Quiénes somos">
          <p>
            <strong>Agenda SaaS</strong> es la plataforma tecnológica que permite a salones, barberías y negocios similares ("el
            <strong> negocio</strong>" o "el <strong>tenant</strong>") ofrecer agendamiento de horas en línea a sus propios clientes.
          </p>
          <p>
            Para efectos de la Ley N° 21.719 sobre Protección de Datos Personales, el <strong>negocio</strong> que administra tu
            reserva es el <strong>responsable</strong> de tus datos como cliente final (decide qué servicios ofrecerte, con qué
            profesional te atiende y cómo se comunica contigo). <strong>Agenda SaaS</strong> actúa como <strong>encargado de
            tratamiento</strong>: opera la infraestructura técnica (base de datos, envío de notificaciones, pagos) siguiendo las
            instrucciones del negocio y bajo los resguardos descritos en esta política. Si te registras como dueño de un negocio en
            la plataforma, Agenda SaaS es responsable de tus propios datos como usuario de la plataforma (nombre, email, datos de tu
            negocio y de tu suscripción).
          </p>
        </Section>

        <Section title="2. Qué datos recopilamos">
          <p>Si reservas una hora como cliente final:</p>
          <ul className="list-disc pl-5">
            <li>Nombre y apellido, teléfono y correo electrónico, para identificarte y contactarte.</li>
            <li>Notas que escribas voluntariamente al reservar (por ejemplo, preferencias o alergias).</li>
            <li>Historial de reservas, visitas y gasto en el negocio donde reservas, para llevar tu ficha de cliente.</li>
            <li>Si el negocio tiene programa de fidelidad, tu nivel (bronce/plata/oro/diamante) según tu número de visitas.</li>
          </ul>
          <p>Si te registras como dueño o profesional de un negocio en Agenda SaaS:</p>
          <ul className="list-disc pl-5">
            <li>Nombre, email y contraseña de tu cuenta.</li>
            <li>Datos de tu negocio: nombre, dirección, horarios, servicios, y si corresponde, tu cuenta bancaria para recibir pagos por transferencia.</li>
            <li>Datos de facturación de tu suscripción a la plataforma, procesados por Stripe.</li>
          </ul>
        </Section>

        <Section title="3. Para qué usamos tus datos">
          <ul className="list-disc pl-5">
            <li>Gestionar tu reserva: confirmarla, recordártela, permitirte reagendarla o cancelarla.</li>
            <li>Enviarte notificaciones transaccionales por email y/o WhatsApp sobre tu reserva.</li>
            <li>Mantener tu ficha de cliente en el negocio donde reservas y, si aplica, calcular tu nivel de fidelidad y el descuento asociado.</li>
            <li>Procesar el pago de tu reserva o de la suscripción del negocio a la plataforma.</li>
            <li>Mostrar la ubicación del negocio en un mapa y, si el negocio lo activó, sus reseñas de Google.</li>
            <li>Cumplir obligaciones legales y responder solicitudes de las autoridades competentes.</li>
          </ul>
          <p>
            La base que nos habilita para tratar tus datos como cliente final es principalmente la <strong>ejecución del contrato
            de servicios</strong> que celebras con el negocio al reservar (arts. 12 y 13 de la Ley 21.719); cuando la ley lo exige
            para un tratamiento adicional, te pedimos tu <strong>consentimiento</strong> expreso (por ejemplo, al marcar la casilla
            de aceptación antes de confirmar tu reserva o tu registro). Puedes retirar ese consentimiento en cualquier momento
            escribiendo a {CONTACT_EMAIL}, sin que afecte reservas ya confirmadas.
          </p>
        </Section>

        <Section title="4. Con quién compartimos tus datos">
          <p>No vendemos tus datos personales. Los compartimos únicamente con proveedores que nos ayudan a prestar el servicio:</p>
          <ul className="list-disc pl-5">
            <li><strong>Supabase</strong> — aloja la base de datos y la infraestructura de la plataforma.</li>
            <li><strong>Stripe</strong> — procesa pagos en línea; no almacenamos tu número de tarjeta.</li>
            <li><strong>Resend</strong> — envía las notificaciones por correo electrónico de tu reserva.</li>
            <li><strong>Evolution API</strong> (WhatsApp) — envía las notificaciones por WhatsApp de tu reserva, cuando el negocio lo tiene activado.</li>
            <li><strong>Google Maps / Google Places</strong> — muestra la ubicación y reseñas del negocio.</li>
          </ul>
          <p>Cada uno de estos proveedores solo recibe los datos estrictamente necesarios para cumplir su función.</p>
        </Section>

        <Section title="5. Elaboración de perfiles y fidelización">
          <p>
            Si el negocio donde reservas tiene programa de fidelidad, el sistema clasifica automáticamente a cada cliente en un
            nivel (bronce, plata, oro o diamante) según su número de visitas, y puede aplicar un descuento automático en el precio
            según ese nivel. Esto constituye una <strong>elaboración de perfiles</strong> en los términos del art. 8 bis de la Ley
            21.719: es un cálculo automático, sin intervención humana, que puede afectar el precio que pagas. No se usa para tomar
            decisiones que te afecten fuera del contexto de ese negocio ni se comparte con terceros ajenos al programa.
          </p>
        </Section>

        <Section title="6. Cuánto tiempo conservamos tus datos">
          <p>
            Conservamos tu ficha de cliente y tu historial de reservas mientras el negocio donde reservaste mantenga su cuenta
            activa en Agenda SaaS y mientras exista una relación comercial vigente (visitas dentro de un plazo razonable). Si el
            negocio deja de operar en la plataforma, los datos de sus clientes se anonimizan una vez transcurrido un período
            prudente de inactividad. Puedes solicitar antes de ese plazo que eliminemos o anonimicemos tus datos, escribiendo a
            {' '}{CONTACT_EMAIL} (ver sección de derechos, abajo).
          </p>
        </Section>

        <Section title="7. Tus derechos (ARCOP)">
          <p>Como titular de tus datos, la Ley 21.719 te da derecho a:</p>
          <ul className="list-disc pl-5">
            <li><strong>Acceso</strong>: saber qué datos tuyos tenemos.</li>
            <li><strong>Rectificación</strong>: corregir datos inexactos o desactualizados.</li>
            <li><strong>Cancelación</strong>: pedir que eliminemos tus datos cuando corresponda.</li>
            <li><strong>Oposición</strong>: oponerte a un tratamiento específico de tus datos.</li>
            <li><strong>Portabilidad</strong>: recibir tus datos en un formato que puedas transferir a otro proveedor.</li>
            <li><strong>Bloqueo</strong>: pedir la suspensión temporal del tratamiento mientras se resuelve una solicitud.</li>
          </ul>
          <p>
            Para ejercer cualquiera de estos derechos, completa nuestro{' '}
            <Link to="/solicitud-datos" className="font-semibold text-[#4F46E5] underline">
              formulario de solicitud
            </Link>{' '}
            o escríbenos a <strong>{CONTACT_EMAIL}</strong> indicando tu nombre, el negocio donde reservaste y qué derecho quieres
            ejercer. Responderemos dentro de los plazos que establece la ley (30 días corridos, prorrogables una vez por otros 30
            si la solicitud es compleja).
          </p>
        </Section>

        <Section title="8. Menores de edad">
          <p>
            Nuestros servicios están dirigidos a personas mayores de edad. Si reservas una hora para un hijo, hija o persona bajo
            tu cuidado, declaras que actúas como su representante y que cuentas con la autorización correspondiente. Si tomamos
            conocimiento de que se registraron datos de un menor sin la autorización de un adulto responsable, los eliminaremos a
            la brevedad; puedes reportarlo a {CONTACT_EMAIL}.
          </p>
        </Section>

        <Section title="9. Seguridad y confidencialidad">
          <p>
            Aplicamos medidas técnicas y organizativas razonables para proteger tus datos: acceso restringido por roles dentro de
            cada negocio, cifrado en tránsito, y separación de credenciales sensibles fuera del código de la aplicación. Ningún
            sistema es 100% infalible; si detectamos una vulneración de seguridad que afecte tus datos, lo notificaremos conforme
            a la ley a la autoridad competente y, cuando corresponda, a ti.
          </p>
        </Section>

        <Section title="10. Cambios a esta política">
          <p>
            Podemos actualizar esta política para reflejar cambios en el servicio o en la normativa vigente. Publicaremos la
            versión vigente en esta misma página con su fecha de actualización.
          </p>
        </Section>

        <Section title="11. Términos del servicio">
          <p>
            Si administras un negocio en la plataforma, la relación contractual se rige además por los{' '}
            <Link to="/terminos" className="font-semibold text-[#4F46E5] underline">
              términos del servicio
            </Link>
            , cuyo Anexo A detalla cómo Agenda SaaS trata los datos de tus clientes por cuenta tuya.
          </p>
        </Section>

        <Section title="12. Contacto">
          <p>
            Para consultas sobre esta política o para ejercer tus derechos, escríbenos a <strong>{CONTACT_EMAIL}</strong>.
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
