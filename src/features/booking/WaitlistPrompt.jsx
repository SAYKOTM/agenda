import { useState } from 'react';
import { joinWaitlist, ApiError } from '../../lib/api';

const inputCls =
  'min-h-11 w-full rounded-[12px] border border-[var(--t-border)] bg-[var(--t-panel)] px-3 text-[14px] text-[var(--t-ink)]';

// Lo que ve el cliente cuando el día que quería está lleno: en vez de irse, deja su nombre y su
// WhatsApp. El aviso no le llega a él por push -- nadie instala la web de su barbería -- sino al
// profesional, que le escribe por WhatsApp cuando se libera la hora (ver la migración 0052).
export default function WaitlistPrompt({ tenantSlug, professionalId, serviceIds, date, dateLabel }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setError('Escribe tu nombre.');
      return;
    }
    if (phone.replace(/\D/g, '').length < 8) {
      setError('Escribe tu WhatsApp con código de país, por ejemplo +56912345678.');
      return;
    }
    setError('');
    setSending(true);
    try {
      await joinWaitlist({ tenantSlug, professionalId, serviceIds, date, name, phone });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos anotarte, inténtalo de nuevo.');
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <p className="mt-3 rounded-[14px] border border-[var(--t-border)] px-3 py-2.5 text-[12.5px] text-[var(--t-sub)]">
        Listo, quedaste en la lista de espera{dateLabel ? ` para el ${dateLabel}` : ''}. Si se libera una hora te
        escribimos por WhatsApp.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 min-h-11 w-full rounded-[14px] text-[13px] font-bold"
        style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
      >
        Avísame si se libera una hora
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 text-left">
      <p className="m-0 text-[12.5px] text-[var(--t-sub)]">
        Te escribimos por WhatsApp apenas se libere una hora{dateLabel ? ` el ${dateLabel}` : ' ese día'}.
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tu nombre"
        autoComplete="name"
        className={inputCls}
      />
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="+56912345678"
        inputMode="tel"
        autoComplete="tel"
        className={inputCls}
      />
      {error && <span className="text-[12px] font-medium text-[#C0402B]">{error}</span>}
      <button
        type="submit"
        disabled={sending}
        className="min-h-11 rounded-[14px] text-[13px] font-bold disabled:opacity-60"
        style={{ background: 'var(--t-accent)', color: 'var(--t-accent-ink)' }}
      >
        {sending ? 'Anotando…' : 'Anotarme en la lista'}
      </button>
    </form>
  );
}
