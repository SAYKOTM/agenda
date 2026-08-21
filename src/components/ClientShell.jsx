// Shell "dispositivo" del flujo de cliente: por debajo de los 520px de ancho del contenedor
// (no del viewport — la app puede vivir embebida en un panel angosto) ocupa el 100% sin marco;
// por encima, es una tarjeta centrada con esquinas redondeadas, como una app de teléfono.
// El contenedor raíz lleva `@container` para que todo lo de adentro pueda usar variantes `@`.
//
// Layout de viewport fijo: la tarjeta mide exactamente 100dvh (100vh dinámico, correcto en
// móvil con barra de navegador) y no crece con el contenido. Header y footer de cada pantalla
// son `flex-shrink-0` (quedan fijos) y el bloque de contenido entre medio es el único que
// hace scroll (`flex-1 overflow-y-auto`), para que el cliente nunca pierda de vista en qué
// salón y en qué paso está, sin tener que scrollear la página completa.
export default function ClientShell({ theme, children }) {
  const vars = {
    '--t-bg': theme.bg,
    '--t-panel': theme.panel,
    '--t-ink': theme.ink,
    '--t-sub': theme.sub,
    '--t-border': theme.border,
    '--t-accent': theme.accent,
    '--t-accent-ink': theme.accentInk,
  };
  return (
    <div className="@container h-dvh w-full bg-[#F1F2F5] flex flex-col items-center px-0 py-0 @[520px]:px-4 @[520px]:py-6" style={vars}>
      <div
        className="flex h-dvh w-full flex-col overflow-hidden bg-[var(--t-bg)] text-[var(--t-ink)] @[520px]:h-[calc(100dvh-48px)] @[520px]:max-w-[438px] @[520px]:rounded-[28px] @[520px]:border @[520px]:border-[var(--t-border)] @[520px]:shadow-[0_22px_60px_rgba(23,25,26,.16)]"
      >
        {children}
      </div>
    </div>
  );
}
