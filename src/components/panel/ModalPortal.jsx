import { useEffect } from 'react';
import { createPortal } from 'react-dom';

// Todo modal/drawer del panel monta acá, en <body>, NO donde vive el componente que lo abre.
// Motivo: el layout del panel envuelve el contenido en un `@container`, y container-type crea un
// bloque contenedor -- un `position: fixed` adentro se ancla al alto COMPLETO de la página en vez
// de al del viewport. En el teléfono eso hacía que, con la página scrolleada (la lista de
// clientes, la de servicios), el modal se abriera "más arriba" de lo visible y con un alto mayor
// que la pantalla. Desde <body> el fixed vuelve a ser relativo al viewport.
//
// Por la misma razón, adentro de estos modales no se pueden usar variantes de container query
// (`@[520px]:`): fuera del @container no tienen contenedor contra el cual medir. Se usan breakpoints
// de viewport (`min-[520px]:`), que acá significan lo mismo porque el modal ocupa toda la pantalla.
export default function ModalPortal({ onClose, align = 'center', z = 70, children }) {
  // Escape cierra, y el fondo de la página no scrollea detrás del modal abierto.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className={
        'fixed inset-0 flex bg-[rgba(15,23,42,.4)] ' +
        (align === 'end' ? 'justify-end ' : 'items-center justify-center p-0 min-[520px]:p-5 ')
      }
      style={{ zIndex: z }}
    >
      {children}
    </div>,
    document.body
  );
}
