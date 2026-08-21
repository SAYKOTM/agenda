import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F1F2F5] px-6 text-center">
      <h1 className="text-xl font-bold text-slate-900">Página no encontrada</h1>
      <p className="text-sm text-slate-500">Revisa el link o vuelve a intentarlo.</p>
      <Link to="/" className="text-sm font-semibold text-indigo-600">
        Ir al inicio
      </Link>
    </div>
  );
}
