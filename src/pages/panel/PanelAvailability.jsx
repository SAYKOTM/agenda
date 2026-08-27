import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePanelAvailability } from '../../features/panel/usePanelAvailability';
import { useToast } from '../../components/Toast';
import DatePicker from '../../components/panel/DatePicker';
import TimeWheelPicker from '../../components/panel/TimeWheelPicker';
import { durLabel, hhmm, WEEKDAYS_LONG, capitalize } from '../../lib/format';
import { applyLunchBreakToDayBlocks } from '../../lib/schedule';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

export default function PanelAvailability() {
  const { professional } = useOutletContext();
  const toast = useToast();
  const { loading, error, blocks, exceptions, reload } = usePanelAvailability(professional.id);
  const [addingException, setAddingException] = useState(false);
  const [configuringLunch, setConfiguringLunch] = useState(false);

  const totalMin = blocks.reduce((a, b) => a + (b.end_min - b.start_min), 0);

  async function addBlock(weekday) {
    const dayBlocks = blocks.filter((b) => b.weekday === weekday);
    const last = dayBlocks[dayBlocks.length - 1];
    const start = last ? Math.min(last.end_min + 60, 1140) : 600;
    const { error } = await supabase.from('availability_blocks').insert({ professional_id: professional.id, weekday, start_min: start, end_min: Math.min(start + 240, 1440) });
    if (error) toast('No pudimos agregar el bloque');
    else { toast('Bloque agregado'); reload(); }
  }

  async function updateBlock(block, field, minutes) {
    const patch = { [field]: minutes };
    if (field === 'start_min' && minutes >= block.end_min) return;
    if (field === 'end_min' && minutes <= block.start_min) return;
    const { error } = await supabase.from('availability_blocks').update(patch).eq('id', block.id);
    if (error) toast('Ese horario se superpone con otro bloque');
    else reload();
  }

  async function deleteBlock(id) {
    const { error } = await supabase.from('availability_blocks').delete().eq('id', id);
    if (error) toast('No pudimos eliminar el bloque');
    else { toast('Bloque eliminado'); reload(); }
  }

  // Recorre cada día de la semana y, donde el turno lo permita, reemplaza el bloque que contiene
  // la colación por los dos bloques resultantes (ver splitBlockForLunch en lib/schedule). No hay
  // un botón "Guardar" global para el horario semanal -- cada bloque se persiste al toque, igual
  // que addBlock/updateBlock/deleteBlock de arriba -- así que esto hace lo mismo: una serie de
  // inserts/deletes directos contra availability_blocks. Nunca toca availability_exceptions.
  async function applyLunchBreak(lunchStart, lunchEnd) {
    let daysAffected = 0;
    for (const dw of WEEKDAYS) {
      const dayBlocks = blocks.filter((b) => b.weekday === dw);
      if (!dayBlocks.length) continue; // día cerrado: no hacer nada

      let dayChanged = false;
      for (const block of dayBlocks) {
        const split = applyLunchBreakToDayBlocks([block], lunchStart, lunchEnd);
        if (split.length < 2) continue; // la colación no cae adentro de este bloque

        // Inserta primero los dos bloques nuevos y recién después borra el original: si el
        // insert fallara, el bloque original queda intacto en vez de desaparecer sin reemplazo.
        const { error: insError } = await supabase.from('availability_blocks').insert(
          split.map((s) => ({ professional_id: professional.id, weekday: dw, start_min: s.start_min, end_min: s.end_min }))
        );
        if (insError) continue;
        const { error: delError } = await supabase.from('availability_blocks').delete().eq('id', block.id);
        if (delError) continue;
        dayChanged = true;
      }
      if (dayChanged) daysAffected++;
    }

    setConfiguringLunch(false);
    reload();
    toast(daysAffected ? `Colación aplicada en ${daysAffected} día${daysAffected === 1 ? '' : 's'}` : 'Ningún turno cruzaba ese horario de colación');
  }

  async function deleteException(id) {
    const { error } = await supabase.from('availability_exceptions').delete().eq('id', id);
    if (error) toast('No pudimos eliminar la excepción');
    else { toast('Excepción eliminada'); reload(); }
  }

  return (
    <div className="relative isolate flex flex-col gap-4">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 right-0 -z-10 h-72 w-72 rounded-full bg-indigo-200/40 blur-[90px]" />
      <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 -z-10 h-72 w-72 rounded-full bg-rose-100/40 blur-[90px]" />

      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[22px] font-extrabold tracking-tight text-slate-900">Disponibilidad</h1>
          <p className="mt-1 text-[13px] text-slate-500">Horario semanal recurrente y excepciones</p>
        </div>
        <button type="button" onClick={() => setAddingException(true)} className="min-h-10 rounded-2xl bg-slate-900 px-4 text-[12.5px] font-bold text-white shadow-sm transition-transform active:scale-[0.97]">
          + Excepción
        </button>
      </div>

      {error && <p className="text-sm text-rose-600">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-slate-500">Cargando…</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 items-start gap-4 @[900px]:grid-cols-2">
          <div className="overflow-hidden rounded-[28px] border border-white/60 bg-white/70 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-28px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-slate-900/5 px-5 py-4">
              <span className="text-[14px] font-bold text-slate-800">Horario semanal recurrente</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfiguringLunch((v) => !v)}
                  className="rounded-full border border-slate-200/80 bg-white/70 px-3 py-1 text-[11.5px] font-semibold text-slate-600 backdrop-blur-sm transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  Configurar colación
                </button>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-indigo-400">{durLabel(totalMin)} / semana</span>
              </div>
            </div>
            {configuringLunch && <LunchBreakForm onCancel={() => setConfiguringLunch(false)} onApply={applyLunchBreak} />}
            {WEEKDAYS.map((dw) => {
              const dayBlocks = blocks.filter((b) => b.weekday === dw);
              return (
                <div key={dw} className="flex flex-col gap-2.5 border-b border-slate-900/5 px-5 py-3.5 last:border-b-0 @[500px]:flex-row @[500px]:items-start">
                  <div className="w-24 flex-none pt-2 text-[13px] font-semibold text-slate-700">{capitalize(WEEKDAYS_LONG[dw])}</div>
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    {dayBlocks.map((b) => (
                      <div key={b.id} className="group flex items-center gap-1 rounded-2xl border border-slate-200/70 bg-white py-1.5 pl-3 pr-1.5 shadow-sm">
                        <TimeWheelPicker value={b.start_min} onChange={(m) => updateBlock(b, 'start_min', m)} label="Hora de inicio" />
                        <span className="text-[12px] text-slate-300">–</span>
                        <TimeWheelPicker value={b.end_min} onChange={(m) => updateBlock(b, 'end_min', m)} label="Hora de fin" />
                        <button
                          type="button"
                          onClick={() => deleteBlock(b.id)}
                          aria-label="Eliminar bloque"
                          className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[11px] text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-400"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    {dayBlocks.length === 0 && <span className="rounded-2xl bg-slate-100/70 px-3 py-2 text-[12px] font-medium text-slate-400">Cerrado</span>}
                    <button
                      type="button"
                      onClick={() => addBlock(dw)}
                      className="min-h-8 rounded-2xl border border-dashed border-slate-300 px-3 text-[12px] font-semibold text-slate-500 transition-colors hover:border-slate-400 hover:bg-white/60 hover:text-slate-700"
                    >
                      + Bloque
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-[28px] border border-white/60 bg-white/70 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_48px_-28px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="mb-3 text-[14px] font-bold text-slate-800">Excepciones puntuales</div>
            {addingException && <ExceptionForm professionalId={professional.id} onDone={() => { setAddingException(false); reload(); }} onCancel={() => setAddingException(false)} toast={toast} />}
            {exceptions.length === 0 && !addingException && <p className="text-[12.5px] text-slate-500">Sin excepciones registradas.</p>}
            <div className="flex flex-col gap-2">
              {exceptions.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/60 px-3.5 py-2.5">
                  <span className="flex-none rounded-lg bg-slate-100/80 px-2 py-1 font-mono text-[10.5px] font-semibold text-slate-600">{e.date}</span>
                  <span className="min-w-0 flex-1 text-[12.5px] text-slate-700">
                    {e.type === 'blocked' ? 'Bloqueo' : 'Extra'}
                    {e.start_min != null ? ` · ${hhmm(e.start_min)}–${hhmm(e.end_min)}` : ' · día completo'}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </span>
                  <span className={'flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ' + (e.type === 'blocked' ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600')}>
                    <span className={'h-1.5 w-1.5 rounded-full ' + (e.type === 'blocked' ? 'bg-rose-400' : 'bg-emerald-400')} />
                    {e.type === 'blocked' ? 'Bloqueo' : 'Extra'}
                  </span>
                  <button type="button" onClick={() => deleteException(e.id)} aria-label="Eliminar excepción" className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-[12px] text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-400">
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-slate-400">Las excepciones se aplican sobre el horario recurrente y se reflejan de inmediato en el link público.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Switch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-2.5 text-[12.5px] font-medium text-slate-600"
    >
      <span className={'relative h-6 w-10 flex-none rounded-full transition-colors ' + (checked ? 'bg-slate-900' : 'bg-slate-200')}>
        <span className={'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ' + (checked ? 'translate-x-4' : 'translate-x-0')} />
      </span>
      {label}
    </button>
  );
}

function TypeToggle({ value, onChange }) {
  return (
    <div className="flex rounded-2xl border border-slate-200/80 bg-white/70 p-1 backdrop-blur-sm">
      {[
        { v: 'blocked', l: 'Bloqueo' },
        { v: 'extra', l: 'Extra' },
      ].map((opt) => (
        <button
          key={opt.v}
          type="button"
          onClick={() => onChange(opt.v)}
          className={
            'flex-1 rounded-xl py-2 text-[12.5px] font-semibold transition-colors ' +
            (value === opt.v ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800')
          }
        >
          {opt.l}
        </button>
      ))}
    </div>
  );
}

// Panel para elegir el horario de colación y aplicarlo a todos los días con turno activo. Solo
// junta start/end en estado local: la división real de bloques vive en applyLunchBreak (arriba),
// que es quien decide qué persistir -- este componente no toca Supabase directamente.
function LunchBreakForm({ onCancel, onApply }) {
  const [start, setStart] = useState(840); // 14:00
  const [end, setEnd] = useState(900); // 15:00
  const [applying, setApplying] = useState(false);

  async function apply() {
    if (end <= start) return;
    setApplying(true);
    await onApply(start, end);
    setApplying(false);
  }

  return (
    <div className="mx-5 mb-1 mt-4 flex flex-col gap-3 rounded-[22px] border border-slate-200/60 bg-white/60 p-4">
      <p className="text-[12.5px] text-slate-500">
        Divide automáticamente los turnos que crucen este horario en dos bloques, dejando la colación libre entre ellos.
      </p>
      <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 py-2">
        <TimeWheelPicker value={start} onChange={setStart} label="Inicio de colación" />
        <span className="text-[12px] text-slate-300">–</span>
        <TimeWheelPicker value={end} onChange={setEnd} label="Fin de colación" />
      </div>
      {end <= start && <p className="text-[11.5px] text-rose-500">La hora de fin debe ser posterior al inicio.</p>}
      <div className="flex gap-2.5">
        <button type="button" onClick={onCancel} className="min-h-10 flex-1 rounded-2xl border border-slate-200/80 bg-white/60 text-[12.5px] font-semibold text-slate-600">
          Cancelar
        </button>
        <button
          type="button"
          onClick={apply}
          disabled={applying || end <= start}
          className="min-h-10 flex-1 rounded-2xl bg-slate-900 text-[12.5px] font-bold text-white shadow-sm disabled:opacity-50"
        >
          Aplicar colación
        </button>
      </div>
    </div>
  );
}

function ExceptionForm({ professionalId, onDone, onCancel, toast }) {
  const [date, setDate] = useState('');
  const [type, setType] = useState('blocked');
  const [fullDay, setFullDay] = useState(true);
  const [start, setStart] = useState(600);
  const [end, setEnd] = useState(840);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!date) {
      toast('Elige una fecha');
      return;
    }
    setSaving(true);
    const partial = type === 'extra' || !fullDay;
    const { error } = await supabase.from('availability_exceptions').insert({
      professional_id: professionalId, date, type,
      start_min: partial ? start : null,
      end_min: partial ? end : null,
      reason: reason || null,
    });
    setSaving(false);
    if (error) toast('No pudimos guardar la excepción');
    else onDone();
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[22px] border border-slate-200/60 bg-white/60 p-4">
      <div className="grid grid-cols-1 gap-2.5 @[420px]:grid-cols-2">
        <DatePicker value={date} onChange={setDate} />
        <TypeToggle value={type} onChange={setType} />
      </div>
      {type === 'blocked' && <Switch checked={fullDay} onChange={setFullDay} label="Bloquear el día completo" />}
      {(type === 'extra' || !fullDay) && (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-slate-200/70 bg-white/70 py-2">
          <TimeWheelPicker value={start} onChange={setStart} label="Hora de inicio" />
          <span className="text-[12px] text-slate-300">–</span>
          <TimeWheelPicker value={end} onChange={setEnd} label="Hora de fin" />
        </div>
      )}
      <input
        placeholder="Motivo (opcional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="min-h-11 rounded-2xl border border-slate-200/80 bg-white/70 px-3.5 text-[13px] text-slate-700 placeholder:text-slate-400 backdrop-blur-sm"
      />
      <div className="flex gap-2.5">
        <button type="button" onClick={onCancel} className="min-h-10 flex-1 rounded-2xl border border-slate-200/80 bg-white/60 text-[12.5px] font-semibold text-slate-600">
          Cancelar
        </button>
        <button type="button" onClick={save} disabled={saving} className="min-h-10 flex-1 rounded-2xl bg-slate-900 text-[12.5px] font-bold text-white shadow-sm disabled:opacity-50">
          Guardar
        </button>
      </div>
    </div>
  );
}
