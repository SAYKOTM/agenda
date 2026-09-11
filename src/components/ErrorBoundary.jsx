import { Component } from 'react';
import { reportError } from '../lib/reportError';

// Última red de contención: un error durante el render deja el árbol de React desmontado y la
// pantalla en blanco. Sin esto, lo que ve la persona es exactamente lo mismo que vería si el sitio
// estuviera caído, y nosotros no nos enteramos nunca.
//
// Es una clase porque los error boundaries no tienen equivalente con hooks: componentDidCatch no
// existe como hook en React 19.
export default class ErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    // El componentStack dice en qué parte del árbol reventó, que es la mitad del diagnóstico.
    reportError({ message: error?.message || 'error de render', stack: `${error?.stack || ''}\n--- componentes ---${info?.componentStack || ''}` }, { kind: 'render' });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F1F2F5] px-6 text-center">
        <div className="text-[15px] font-bold text-[#0F172A]">Algo se rompió en esta pantalla</div>
        <p className="max-w-sm text-[13px] leading-snug text-[#64748B]">
          Ya nos llegó el aviso. Volvé a cargar la página: en general con eso alcanza y no perdés ninguna reserva, porque todo
          queda guardado en el servidor.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-11 rounded-[11px] bg-[#0F172A] px-4 text-[13px] font-semibold text-white"
        >
          Recargar
        </button>
      </div>
    );
  }
}
