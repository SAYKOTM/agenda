import { useState } from 'react';
import { Link } from 'react-router-dom';
import { submitPrivacyRequest, ApiError } from '../lib/api';

const REQUEST_TYPES = [
  { value: 'acceso', label: 'Acceso — saber qué datos tienen de mí' },
  { value: 'rectificacion', label: 'Rectificación — corregir datos incorrectos' },
  { value: 'cancelacion', label: 'Cancelación — eliminar mis datos' },
  { value: 'oposicion', label: 'Oposición — que dejen de usar mis datos' },
  { value: 'portabilidad', label: 'Portabilidad — recibir mis datos' },
  { value: 'bloqueo', label: 'Bloqueo — suspender el tratamiento temporalmente' },
];

const inputCls = 'min-h-12 w-full rounded-[11px] border border-[#D3D7E0] px-3.5 text-[15px] text-[#0F172A]';
const errorCls = 'text-[12px] font-medium text-[#C0402B]';

export default function PrivacyRequest() {
  const [requestType, setRequestType] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tenantSlug, setTenantSlug] = useState('');
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      await submitPrivacyRequest({ requestType, fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), tenantSlug: tenantSlug.trim(), message: message.trim() });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.fields) {
        setFieldErrors(err.fields);
        setError(err.message);
      } else {
        setError(err.message || 'No pudimos enviar tu solicitud, intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] px-4 py-10">
        <div className="flex w-full max-w-[420px] flex-col gap-3 rounded-[20px] border border-[#E2E5EC] bg-white p-7 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[#DCFCE7] text-lg">✓</div>
          <h1 className="text-lg font-extrabold tracking-tight text-[#0F172A]">Solicitud recibida</h1>
          <p className="text-[13px] text-[#64748B]">
            Te enviamos una confirmación a tu correo. Responderemos dentro del plazo que establece la Ley 21.719 (30 días
            corridos, prorrogables una vez si la solicitud es compleja).
          </p>
          <Link to="/" className="mt-2 text-[12.5px] font-semibold text-[#4F46E5]">
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] px-4 py-10">
      <form onSubmit={onSubmit} className="flex w-full max-w-[440px] flex-col gap-4 rounded-[20px] border border-[#E2E5EC] bg-white p-7">
        <div className="flex flex-col gap-1.5">
          <Link to="/privacidad" className="text-[12.5px] font-semibold text-[#4F46E5]">
            ← Política de privacidad
          </Link>
          <h1 className="mt-1 text-lg font-extrabold tracking-tight text-[#0F172A]">Solicitud sobre mis datos</h1>
          <p className="text-[12.5px] text-[#64748B]">Ejerce tus derechos de acceso, rectificación, cancelación, oposición, portabilidad o bloqueo.</p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">¿Qué quieres hacer?</span>
          <select required value={requestType} onChange={(e) => setRequestType(e.target.value)} className={inputCls}>
            <option value="" disabled>
              Elige una opción
            </option>
            {REQUEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          {fieldErrors.requestType && <span className={errorCls}>{fieldErrors.requestType}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Tu nombre</span>
          <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="Nombre y apellido" />
          {fieldErrors.fullName && <span className={errorCls}>{fieldErrors.fullName}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          {fieldErrors.email && <span className={errorCls}>{fieldErrors.email}</span>}
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Teléfono (opcional)</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+56 9 1234 5678" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Salón donde reservaste (opcional)</span>
          <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} className={inputCls} placeholder="ej: barberia-central" />
          <span className="text-[11px] text-[#94A3B8]">Es la parte del link después de agenda.app/. Déjalo vacío si tu solicitud es sobre tu propia cuenta de dueño de salón.</span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] font-bold text-[#475569]">Cuéntanos más (opcional)</span>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} className="w-full resize-y rounded-[14px] border border-[#D3D7E0] px-3.5 py-3 text-[14px] text-[#0F172A]" />
        </label>

        {error && <p className={errorCls}>{error}</p>}

        <button type="submit" disabled={submitting} className="min-h-12 rounded-[13px] bg-[#0F172A] text-[14px] font-bold text-white disabled:opacity-50">
          {submitting ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}
