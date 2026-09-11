// Copiar al portapapeles con respaldo: navigator.clipboard existe solo en contexto seguro
// (https o localhost) y en algunos WebView del teléfono tira excepción incluso ahí, así que si
// falla se cae al truco viejo del textarea + execCommand. Devuelve si se pudo, para que quien
// llama avise con un toast en vez de dejar al usuario creyendo que copió.
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // sigue al respaldo
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
