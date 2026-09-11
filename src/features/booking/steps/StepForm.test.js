// El consentimiento del cliente final es un requisito legal (Ley 21.719, arts. 12-13), no una
// preferencia de UI: estos casos fijan que no se pueda avanzar sin él ni por descuido en un
// refactor. La misma regla se vuelve a exigir en create-booking, porque cualquiera puede llamar a
// esa función sin pasar por este formulario.
import { describe, expect, it } from 'vitest';
import { validateClientForm } from './StepForm';

const valido = { name: 'Camila Aguirre', phone: '+56 9 1234 5678', email: 'camila@correo.cl', notes: '', consent: true };

describe('validateClientForm', () => {
  it('acepta un formulario completo con el consentimiento marcado', () => {
    expect(validateClientForm(valido)).toEqual({});
  });

  it('rechaza la reserva si no se acepta la política de privacidad', () => {
    const errores = validateClientForm({ ...valido, consent: false });
    expect(errores.consent).toBeTruthy();
    expect(Object.keys(errores)).toEqual(['consent']);
  });

  it('trata el consentimiento ausente igual que el rechazado', () => {
    const { consent: _omitido, ...sinCampo } = valido;
    expect(validateClientForm(sinCampo).consent).toBeTruthy();
  });

  it('sigue validando nombre, teléfono y email', () => {
    const errores = validateClientForm({ name: '  ', phone: '123', email: 'no-es-mail', notes: '', consent: true });
    expect(Object.keys(errores).sort()).toEqual(['email', 'name', 'phone']);
  });
});
