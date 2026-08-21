import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePanelAvailability } from '../../features/panel/usePanelAvailability';
import { useToast } from '../../components/Toast';
import { durLabel, WEEKDAYS_LONG, capitalize } from '../../lib/format';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function toTimeStr(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

export default function PanelAvailability() {
  const { professional } = useOutletContext();
  const toast = useToast();
  const { loading, error, blocks, exceptions, reload } = usePanelAvailability(professional.id);
  const [addingException, setAddingException] = useState(false);

  const totalMin = blocks.reduce((a, b) => a + (b.end_min - b.start_min), 0);

  async function addBlock(weekday) {
    const dayBlocks = blocks.filter((b) => b.weekday === weekday);
    const last = dayBlocks[dayBlocks.length - 1];
    const start = last ? Math.min(last.end_min + 60, 1140) : 600;
    const { error } = await supabase.from('availability_blocks').insert({ professional_id: professional.id, weekday, start_min: start, end_min: Math.min(start + 240, 1440) });
    if (error) toast('No pudimos agregar el bloque');
    else { toast('Bloque agregado'); reload(); }
  }

  async function updateBlock(block, field, timeStr) {
    const minutes = toMinutes(timeStr);
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

  async function deleteException(id) {
    const { error } = await supabase.from('availability_exceptions').delete().eq('id', id);
    if (error) toast('No pudimos eliminar la excepción');
    else { toast('Excepción eliminada'); reload(); }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-[21px] font-extrabold tracking-tight text-[#0F172A]">Disponibilidad</h1>
          <p className="mt-0.5 text-[12.5px] text-[#64748B]">Horario semanal recurrente y excepciones</p>
        </div>
        <button type="button" onClick={() => setAddingException(true)} className="min-h-9 rounded-[9px] bg-[#0F172A] px-3.5 text-[12.5px] font-bold text-white">+ Excepción</button>
      </div>

      {error && <p className="text-sm text-[#C0402B]">{error}</p>}
      {loading && <p className="py-8 text-center text-sm text-[#64748B]">Cargando…</p>}

      {!loading && !error && (
        <div className="grid grid-cols-1 items-start gap-3 @[900px]:grid-cols-2">
          <div className="overflow-hidden rounded-[16px] border border-[#E2E5EC] bg-white">
            <div className="flex items-center justify-between border-b border-[#E2E5EC] px-3.5 py-3">
              <span className="text-[13.5px] font-bold">Horario semanal recurrente</span>
              <span className="font-mono text-[11px] text-[#64748B]">{durLabel(totalMin)} a la semana</span>
            </div>
            {WEEKDAYS.map((dw) => {
              const dayBlocks = blocks.filter((b) => b.weekday === dw);
              return (
                <div key={dw} className="flex flex-col gap-2 border-b border-[#F1F2F5] px-3.5 py-2.5 @[500px]:flex-row @[500px]:items-start">
                  <div className="w-20 flex-none pt-1.5 text-[12.5px] font-semibold">{capitalize(WEEKDAYS_LONG[dw])}</div>
                  <div className="flex flex-1 flex-wrap items-center gap-1.5">
                    {dayBlocks.map((b) => (
                      <div key={b.id} className="flex items-center gap-1.5 rounded-[9px] border border-[#D7DAFB] bg-[#F3F4FE] py-1 pl-2.5 pr-1.5">
                        <input type="time" defaultValue={toTimeStr(b.start_min)} onBlur={(e) => updateBlock(b, 'start_min', e.target.value)} className="w-[74px] border-none bg-transparent font-mono text-[11.5px] font-medium text-[#3730A3]" />
                        <span className="text-[11px] text-[#3730A3]">–</span>
                        <input type="time" defaultValue={toTimeStr(b.end_min)} onBlur={(e) => updateBlock(b, 'end_min', e.target.value)} className="w-[74px] border-none bg-transparent font-mono text-[11.5px] font-medium text-[#3730A3]" />
                        <button type="button" onClick={() => deleteBlock(b.id)} aria-label="Eliminar bloque" className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-[#E4E6FC] text-[11px] text-[#3730A3]">✕</button>
                      </div>
                    ))}
                    {dayBlocks.length === 0 && <span className="rounded-[9px] bg-[#F1F2F5] px-2.5 py-1.5 text-[11.5px] text-[#64748B]">Cerrado</span>}
                    <button type="button" onClick={() => addBlock(dw)} className="min-h-7.5 rounded-[9px] border border-dashed border-[#C0C5D2] px-2.5 text-[11.5px] font-semibold text-[#475569]">+ Bloque</button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-[16px] border border-[#E2E5EC] bg-white p-3.5">
            <div className="mb-2.5 text-[13.5px] font-bold">Excepciones puntuales</div>
            {addingException && <ExceptionForm professionalId={professional.id} onDone={() => { setAddingException(false); reload(); }} onCancel={() => setAddingException(false)} toast={toast} />}
            {exceptions.length === 0 && !addingException && <p className="text-[12.5px] text-[#64748B]">Sin excepciones registradas.</p>}
            <div className="flex flex-col gap-2">
              {exceptions.map((e) => (
                <div key={e.id} className="flex items-center gap-2.5 rounded-[11px] border border-[#E2E5EC] px-2.5 py-2">
                  <span className="w-16 flex-none font-mono text-[11px]">{e.date}</span>
                  <span className="min-w-0 flex-1 text-[12.5px]">
                    {e.type === 'blocked' ? 'Bloqueo' : 'Extra'}
                    {e.start_min != null ? ` · ${toTimeStr(e.start_min)}–${toTimeStr(e.end_min)}` : ' · día completo'}
                    {e.reason ? ` · ${e.reason}` : ''}
                  </span>
                  <span className={'flex-none rounded-[7px] px-2 py-0.5 text-[10.5px] font-bold ' + (e.type === 'blocked' ? 'bg-[#FBE7E4] text-[#A33421]' : 'bg-[#E7F4EC] text-[#1E6B43]')}>{e.type === 'blocked' ? 'Bloqueo' : 'Extra'}</span>
                  <button type="button" onClick={() => deleteException(e.id)} aria-label="Eliminar excepción" className="flex-none text-[13px] text-[#A33421]">✕</button>
                </div>
              ))}
            </div>
            <p className="mt-2.5 text-[11.5px] text-[#64748B]">Las excepciones se aplican sobre el horario recurrente y se reflejan de inmediato en el link público.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ExceptionForm({ professionalId, onDone, onCancel, toast }) {
  const [date, setDate] = useState('');
  const [type, setType] = useState('blocked');
  const [fullDay, setFullDay] = useState(true);
  const [start, setStart] = useState('10:00');
  const [end, setEnd] = useState('14:00');
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
      start_min: partial ? toMinutes(start) : null,
      end_min: partial ? toMinutes(end) : null,
      reason: reason || null,
    });
    setSaving(false);
    if (error) toast('No pudimos guardar la excepción');
    else onDone();
  }

  return (
    <div className="mb-3 flex flex-col gap-2.5 rounded-[13px] border border-[#E2E5EC] p-3">
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-10 rounded-[9px] border border-[#D3D7E0] px-2.5 text-[13px]" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="min-h-10 rounded-[9px] border border-[#D3D7E0] px-2.5 text-[13px]">
          <option value="blocked">Bloqueo</option>
          <option value="extra">Extra</option>
        </select>
      </div>
      {type === 'blocked' && (
        <label className="flex items-center gap-2 text-[12.5px]">
          <input type="checkbox" checked={fullDay} onChange={(e) => setFullDay(e.target.checked)} />
          Bloquear el día completo
        </label>
      )}
      {(type === 'extra' || !fullDay) && (
        <div className="grid grid-cols-2 gap-2">
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="min-h-10 rounded-[9px] border border-[#D3D7E0] px-2.5 text-[13px]" />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="min-h-10 rounded-[9px] border border-[#D3D7E0] px-2.5 text-[13px]" />
        </div>
      )}
      <input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-10 rounded-[9px] border border-[#D3D7E0] px-2.5 text-[13px]" />
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="min-h-9 flex-1 rounded-[9px] border border-[#E2E5EC] text-[12.5px] font-semibold">Cancelar</button>
        <button type="button" onClick={save} disabled={saving} className="min-h-9 flex-1 rounded-[9px] bg-[#0F172A] text-[12.5px] font-bold text-white disabled:opacity-50">Guardar</button>
      </div>
    </div>
  );
}
