import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { useTenantData } from '../features/tenant/useTenantData';
import { supabase } from '../lib/supabaseClient';
import { createBooking, ApiError } from '../lib/api';
import { hhmm, dateLine, capitalize } from '../lib/format';
import { useToast } from '../components/Toast';
import ClientShell from '../components/ClientShell';
import WizardHeader from '../components/WizardHeader';
import StepProfessional from '../features/booking/steps/StepProfessional';
import StepServices from '../features/booking/steps/StepServices';
import StepTime from '../features/booking/steps/StepTime';
import StepForm, { validateClientForm } from '../features/booking/steps/StepForm';
import StepPay from '../features/booking/steps/StepPay';
import StepDone from '../features/booking/steps/StepDone';

export default function BookingWizard() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { loading, error, redirectSlug, tenant, categories, professionals, paymentMethods, bankAccount } = useTenantData(slug);

  const singlePro = professionals.length === 1;
  const steps = useMemo(() => (singlePro ? ['services', 'time', 'form', 'pay', 'done'] : ['pro', 'services', 'time', 'form', 'pay', 'done']), [singlePro]);
  const stepCount = singlePro ? 4 : 5;

  const [step, setStep] = useState(null);
  const [professionalId, setProfessionalId] = useState(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [date, setDate] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [touched, setTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState(null);

  useEffect(() => {
    if (!loading && !error && !redirectSlug && step === null) {
      if (singlePro) setProfessionalId(professionals[0].id);
      setStep(singlePro ? 'services' : 'pro');
      setDate(Temporal.Now.plainDateISO(tenant.timezone).toString());
    }
  }, [loading, error, redirectSlug, singlePro, professionals, tenant, step]);

  if (loading) return <LoadingShell />;
  if (redirectSlug) return <Navigate to={`/${redirectSlug}/reservar`} replace />;
  if (error) return <ErrorShell error={error} slug={slug} />;
  if (step === null) return <LoadingShell />;

  const allServices = categories.flatMap((c) => c.services);
  const selectedServices = selectedServiceIds.map((id) => allServices.find((s) => s.id === id)).filter(Boolean);
  const totalDurationMin = selectedServices.reduce((a, s) => a + s.duration_min, 0);
  const proLabel = professionalId === 'any' ? 'cualquiera disponible' : professionals.find((p) => p.id === professionalId)?.name || '';
  // Cada servicio pertenece a un solo profesional: al elegir uno en concreto, el paso de
  // servicios muestra únicamente su propio catálogo (con "cualquiera disponible" se ven todos).
  const visibleCategories =
    professionalId && professionalId !== 'any'
      ? categories.map((c) => ({ ...c, services: c.services.filter((s) => s.professional_id === professionalId) })).filter((c) => c.services.length > 0)
      : categories;
  const pickedLine = slot ? `${capitalize(dateLine(Temporal.PlainDate.from(date)))} · ${hhmm(slot.startMinute)} h` : '';

  const stepIndex = steps.indexOf(step) + 1; // 1-based, 'done' cae fuera del rango mostrado en las migas
  const showCrumbs = step !== 'done';

  function goBack() {
    const i = steps.indexOf(step);
    if (i <= 0) navigate(`/${slug}`);
    else setStep(steps[i - 1]);
  }

  function toggleService(id) {
    setSelectedServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.concat(id)));
    setSlot(null);
  }

  function pickSlot(newDate, newSlot) {
    setDate(newDate);
    setSlot(newSlot);
  }

  const formErrors = touched ? validateClientForm(form) : {};

  function goToPay() {
    const errs = validateClientForm(form);
    setTouched(true);
    if (Object.keys(errs).length) {
      toast('Revisa los campos marcados');
      return;
    }
    setStep('pay');
    supabase
      .rpc('lookup_customer_tier', { p_tenant_id: tenant.id, p_phone: form.phone.trim() })
      .then(({ data }) => setLoyaltyPreview(data || null));
  }

  async function submitBooking() {
    if (!paymentMethod || submitting) return;
    setSubmitting(true);
    try {
      const res = await createBooking({
        tenantSlug: slug,
        professionalId,
        serviceIds: selectedServiceIds,
        date,
        startMinute: slot.startMinute,
        client: form,
        paymentMethod,
      });
      setBooking(res.booking);
      setStep('done');
      toast('Reserva confirmada · confirmación enviada');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast(e.message);
        setSlot(null);
        setStep('time');
      } else {
        toast(e.message || 'No pudimos completar la reserva, intenta de nuevo');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ClientShell theme={tenant.theme}>
      <WizardHeader tenant={tenant} onBack={step === 'done' ? null : goBack} stepIndex={showCrumbs ? stepIndex : null} stepCount={showCrumbs ? stepCount : null} />

      {step === 'pro' && (
        <StepProfessional
          professionals={professionals}
          selected={professionalId}
          onSelect={(id) => {
            if (id !== professionalId) {
              setSelectedServiceIds([]);
              setSlot(null);
            }
            setProfessionalId(id);
            setStep('services');
          }}
        />
      )}

      {step === 'services' && (
        <StepServices
          categories={visibleCategories}
          selectedIds={selectedServiceIds}
          onToggle={toggleService}
          proLabel={proLabel}
          stepIndex={stepIndex}
          stepCount={stepCount}
          currency={tenant.currency}
          onNext={() => selectedServiceIds.length && setStep('time')}
        />
      )}

      {step === 'time' && (
        <StepTime
          tenant={tenant}
          professionalId={professionalId}
          serviceIds={selectedServiceIds}
          totalDurationMin={totalDurationMin}
          proLabel={proLabel}
          stepIndex={stepIndex}
          stepCount={stepCount}
          date={date}
          slot={slot}
          onPick={pickSlot}
          onNext={() => slot && setStep('form')}
        />
      )}

      {step === 'form' && <StepForm form={form} onChange={setForm} errors={formErrors} stepIndex={stepIndex} stepCount={stepCount} onNext={goToPay} />}

      {step === 'pay' && (
        <StepPay
          proLabel={proLabel}
          pickedLine={pickedLine}
          items={selectedServices}
          totalPrice={selectedServices.reduce((a, s) => a + s.price_clp, 0)}
          loyaltyPreview={loyaltyPreview}
          cancellationPolicy={tenant.cancellation_policy_text}
          currency={tenant.currency}
          paymentMethods={paymentMethods}
          bankAccount={bankAccount}
          selectedMethod={paymentMethod}
          onSelectMethod={setPaymentMethod}
          stepIndex={stepIndex}
          stepCount={stepCount}
          onPay={submitBooking}
          submitting={submitting}
        />
      )}

      {step === 'done' && booking && (
        <StepDone
          booking={booking}
          items={selectedServices}
          proLabel={proLabel}
          tenant={tenant}
          form={form}
          currency={tenant.currency}
          gateway={paymentMethods.find((m) => m.method === 'online')?.gateway}
          onManage={() => navigate(`/${slug}/reserva/${booking.publicToken}`)}
          onBackHome={() => navigate(`/${slug}`)}
        />
      )}
    </ClientShell>
  );
}

function LoadingShell() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] text-sm text-slate-500" role="status" aria-live="polite">
      Cargando…
    </div>
  );
}

function ErrorShell({ error, slug }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#F1F2F5] px-6 text-center text-sm text-slate-500">
      <p>No pudimos cargar {slug}.</p>
      {error !== 'not_found' && <p className="text-xs">{error}</p>}
    </div>
  );
}
