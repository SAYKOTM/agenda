// Agregar la cita al calendario del cliente desde la pantalla de "Reserva confirmada".
//
// Google tiene su URL de "plantilla de evento", que abre el calendario web ya con los datos
// cargados. Apple no tiene nada equivalente: la forma de meterle un evento a Calendario desde la
// web es un archivo .ics, que es además el formato que entienden todos los demás (Outlook de
// escritorio, Thunderbird). En el iPhone y en el Mac, abrir ese archivo muestra directo la
// pantalla de "Agregar evento", así que el botón dice "Apple Calendar" y no ".ics": el cliente no
// tiene por qué saber qué es un .ics.

// 2026-09-11T18:30:00+00:00 -> 20260911T183000Z (UTC, que es como lo piden Google y el .ics)
function stampUtc(isoInstant) {
  return new Date(isoInstant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl({ title, details, location, startAt, endAt }) {
  // Los parámetros se arman a mano y no con URLSearchParams porque este escapa la barra que
  // separa inicio y fin en `dates` (20260915T170000Z/20260915T180000Z), y Google espera esa
  // barra literal.
  const params = [
    'action=TEMPLATE',
    `text=${encodeURIComponent(title)}`,
    `dates=${stampUtc(startAt)}/${stampUtc(endAt)}`,
    `details=${encodeURIComponent(details)}`,
    `location=${encodeURIComponent(location)}`,
  ];
  return `https://calendar.google.com/calendar/render?${params.join('&')}`;
}

// En un .ics la coma, el punto y coma y la barra invertida separan campos: van escapados, y los
// saltos de línea viajan como \n literal.
function escapeText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545: ninguna línea pasa de 75 octetos; las que siguen arrancan con un espacio. Sin esto,
// una dirección o una lista de servicios larga puede romper el archivo en parsers estrictos.
function fold(line) {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length) {
    parts.push(' ' + rest.slice(0, 72));
    rest = rest.slice(72);
  }
  return parts.join('\r\n');
}

export function buildIcs({ uid, title, details, location, startAt, endAt }) {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Agenda SaaS//Reservas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stampUtc(new Date().toISOString())}`,
    `DTSTART:${stampUtc(startAt)}`,
    `DTEND:${stampUtc(endAt)}`,
    fold(`SUMMARY:${escapeText(title)}`),
    fold(`DESCRIPTION:${escapeText(details)}`),
    fold(`LOCATION:${escapeText(location)}`),
    // Aviso 2 horas antes, el mismo margen con el que el salón manda su recordatorio.
    'BEGIN:VALARM',
    'TRIGGER:-PT2H',
    'ACTION:DISPLAY',
    fold(`DESCRIPTION:${escapeText(title)}`),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// Entrega el .ics al sistema. Se usa un Blob y un <a download> de un solo uso porque una
// navegación a data: la bloquean los navegadores modernos.
export function downloadIcs(ics, filename = 'reserva.ics') {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
