import PasswordForm from '../../components/panel/PasswordForm';

// Primera pantalla de quien llega desde el correo de invitación (o del de recuperar contraseña).
// Supabase ya le abrió la sesión con el token del link, así que entra sin escribir nada -- pero
// su cuenta no tiene contraseña, y sin contraseña no puede volver a entrar en ningún otro lado:
// ni en el teléfono, ni en la app instalada (que guarda su sesión aparte del navegador), ni acá
// mismo cuando esta sesión venza. Por eso se pide antes de mostrar el panel.
export default function PanelSetPassword({ email, onDone, onSkip }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F1F2F5] px-4 py-10">
      <div className="flex w-full max-w-[400px] flex-col gap-4 rounded-[20px] border border-[#E2E5EC] bg-white p-7">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#4F46E5] text-base font-extrabold text-white">A</div>
          <h1 className="text-lg font-extrabold tracking-tight text-[#0F172A]">Elegí tu contraseña</h1>
          <p className="text-[12.5px] text-[#64748B]">
            {email ? <>Tu cuenta es {email}. </> : null}
            Con ella vas a poder entrar desde el teléfono y desde la app instalada, no solo desde este navegador.
          </p>
        </div>

        <PasswordForm ctaLabel="Guardar y entrar al panel" onSaved={onDone} />

        <button type="button" onClick={onSkip} className="min-h-10 text-center text-[12.5px] text-[#64748B] underline">
          Lo hago después
        </button>
        <p className="text-center text-[11px] text-[#94A3B8]">
          Si lo dejás para después y cerrás sesión, vas a tener que pedir el link de nuevo para volver a entrar.
        </p>
      </div>
    </div>
  );
}
