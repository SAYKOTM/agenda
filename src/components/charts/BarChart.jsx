// Gráfico de barras verticales, sin dependencias (SVG inline). Un solo hue (magnitud vía
// altura, no color), extremos redondeados de 4px anclados a la base, hover con <title> nativo
// como tooltip mínimo. Ver skill dataviz: marks-and-anatomy.md.
export default function BarChart({ data, color = '#4F46E5', height = 140, formatValue = (v) => String(v), labelEvery = 1 }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const barW = data.length ? 100 / data.length : 0;

  if (!data.length) return <p className="text-[12.5px] text-[#64748B]">Sin datos en este período.</p>;

  return (
    <div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Ingresos por día">
        {data.map((d, i) => {
          const h = Math.max((d.value / max) * (height - 4), d.value > 0 ? 3 : 0);
          const x = i * barW;
          const w = Math.max(barW - barW * 0.28, 1);
          return (
            <rect key={i} x={x + (barW - w) / 2} y={height - h} width={w} height={h} rx={Math.min(2, w / 2)} fill={color}>
              <title>{`${d.label}: ${formatValue(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[9.5px] text-[#94A3B8]">
        {data.map((d, i) => (
          <span key={i} style={{ width: `${barW}%` }} className="truncate text-center">
            {i % labelEvery === 0 ? d.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}
