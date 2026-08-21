import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/Toast';
import Home from './pages/Home';
import TenantLanding from './pages/TenantLanding';
import BookingWizard from './pages/BookingWizard';
import ManageBooking from './pages/ManageBooking';
import NotFound from './pages/NotFound';
import PanelLogin from './pages/panel/PanelLogin';
import PanelLayout from './pages/panel/PanelLayout';
import PanelDashboard from './pages/panel/PanelDashboard';
import PanelAgenda from './pages/panel/PanelAgenda';
import PanelServices from './pages/panel/PanelServices';
import PanelClients from './pages/panel/PanelClients';
import PanelAvailability from './pages/panel/PanelAvailability';
import PanelProfile from './pages/panel/PanelProfile';
import PanelOverview from './pages/panel/PanelOverview';
import PanelTeam from './pages/panel/PanelTeam';
import PanelStations from './pages/panel/PanelStations';
import PanelPayments from './pages/panel/PanelPayments';
import PanelSettings from './pages/panel/PanelSettings';
import RequireAdmin from './components/panel/RequireAdmin';

export default function AppRouter() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/panel/login" element={<PanelLogin />} />
          <Route path="/panel" element={<PanelLayout />}>
            <Route index element={<PanelDashboard />} />
            <Route path="agenda" element={<PanelAgenda />} />
            <Route path="servicios" element={<PanelServices />} />
            <Route path="clientes" element={<PanelClients />} />
            <Route path="disponibilidad" element={<PanelAvailability />} />
            <Route path="perfil" element={<PanelProfile />} />
            <Route element={<RequireAdmin />}>
              <Route path="resumen" element={<PanelOverview />} />
              <Route path="equipo" element={<PanelTeam />} />
              <Route path="estaciones" element={<PanelStations />} />
              <Route path="pagos" element={<PanelPayments />} />
              <Route path="ajustes" element={<PanelSettings />} />
            </Route>
          </Route>
          <Route path="/:slug" element={<TenantLanding />} />
          <Route path="/:slug/reservar" element={<BookingWizard />} />
          <Route path="/:slug/reserva/:token" element={<ManageBooking />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
