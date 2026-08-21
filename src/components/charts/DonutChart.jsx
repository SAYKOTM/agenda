// Donut de una sola serie categórica (identidad, no magnitud continua) con leyenda de etiqueta
// directa -- el amber de la paleta valida por debajo de 3:1 de contraste contra blanco
// (scripts/validate_palette.js), así que el valor SIEMPRE va como texto, nunca solo color.
const SIZE = 120;
const STROKE = 16;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const GAP = 3; // separación visual entre segmentos, en unidades del perímetro

export default function DonutChart({ data, formatValue = (v) => String(v) }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  if (!total) return <p className="text-[12.5px] text-[#64748B]">Sin datos en este período.</p>;

  const segments = data
    .filter((d) => d.value > 0)
    .reduce((acc, d) => {
      const offset = acc.length ? acc[acc.length - 1].offsetEnd : 0;
      const len = (d.value / total) * CIRC;
      acc.push({ ...d, dasharray: `${Math.max(len - GAP, 0)} ${CIRC - Math.max(len - GAP, 0)}`, dashoffset: -offset, offsetEnd: offset + len });
      return acc;
    }, []);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} role="img" aria-label="Ingresos por método de pago">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#EDEFF3" strokeWidth={STROKE} />
        {segments.map((s, i) => (
          <circle
            key={i}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={s.dasharray}
            strokeDashoffset={s.dashoffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          >
            <title>{`${s.label}: ${formatValue(s.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px]">
            <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: d.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-[#0F172A]">{d.label}</span>
            <span className="flex-none font-mono font-medium text-[#0F172A]">{formatValue(d.value)}</span>
            <span className="w-9 flex-none text-right text-[#94A3B8]">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
