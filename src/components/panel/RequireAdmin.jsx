import { Navigate, Outlet, useOutletContext } from 'react-router-dom';

// Bloquea el acceso directo por URL a las pantallas de nivel salón (Resumen, Equipo, Estaciones,
// Pagos, Ajustes) para cualquier profesional que no sea 'admin'. El sidebar (PanelLayout) ya no
// les muestra estos links, pero eso es solo UX: sin este guard, escribir la URL a mano igual
// cargaba la página. La protección real de los datos vive en las políticas RLS y en las
// funciones de la migración 0012 -- esto es una segunda capa para no ni siquiera montar el
// componente ni intentar la llamada.
export default function RequireAdmin() {
  const ctx = useOutletContext();
  if (ctx.professional.role !== 'admin') return <Navigate to="/panel" replace />;
  return <Outlet context={ctx} />;
}
