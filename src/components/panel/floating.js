import { useLayoutEffect, useRef, useState } from 'react';

// Posiciona un popover con position:fixed pegado a su elemento disparador ("anchor"), recalculando
// si no entra en el viewport (lo voltea hacia arriba / lo desplaza hacia la izquierda). Usa
// position:fixed + portal a document.body (ver TimeWheelPicker/DatePicker) para no depender del
// overflow de las tarjetas de vidrio que lo contienen -- backdrop-blur crea un containing block
// para "fixed" en algunos navegadores si el popover quedara anidado dentro de ellas.
export function useFloatingPosition(open, anchorRef) {
  const [pos, setPos] = useState(null);
  const popRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setPos(null);
      return;
    }
    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      const popW = popRef.current?.offsetWidth || 280;
      const popH = popRef.current?.offsetHeight || 320;
      let left = r.left;
      let top = r.bottom + 8;
      if (top + popH > window.innerHeight - 12) top = Math.max(12, r.top - popH - 8);
      if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
      if (left < 12) left = 12;
      setPos({ top, left });
    };
    // Solo se recalcula al abrir y al cambiar el tamaño de ventana -- deliberadamente NO
    // escucha "scroll" de forma global: un listener en captura reaccionaría también al scroll
    // interno del propio contenido del popover (p. ej. los tambores de TimeWheelPicker),
    // generando un recálculo de posición en cada frame de su animación y una tormenta de renders.
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchorRef es estable
  }, [open]);

  return { pos, popRef };
}

// Cierra el popover al hacer click fuera de cualquiera de los refs dados (disparador + panel
// flotante) o al presionar Escape.
export function useDismiss(open, refs, onClose) {
  useLayoutEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (refs.some((ref) => ref.current?.contains(e.target))) return;
      onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs/onClose se resuelven al vuelo, no deben re-suscribir
  }, [open]);
}
