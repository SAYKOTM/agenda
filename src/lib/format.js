export function money(n, currency = 'CLP', locale = 'es-CL') {
  if (currency === 'CLP') return '$' + Math.round(n).toLocaleString(locale);
  return n.toLocaleString(locale, { style: 'currency', currency });
}

export function durLabel(totalMin) {
  if (totalMin < 60) return totalMin + ' min';
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? h + ' h ' + m + ' min' : h + ' h';
}

export function hhmm(minutesFromMidnight) {
  const h = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function hhmm12(minutesFromMidnight) {
  const h24 = Math.floor(minutesFromMidnight / 60);
  const m = minutesFromMidnight % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return String(h12).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + period;
}

// "10:00 AM - 11:00 AM", usado en el bloque de cita de la Agenda.
export function hhmmRange12(startMin, endMin) {
  return `${hhmm12(startMin)} - ${hhmm12(endMin)}`;
}

const WEEKDAYS_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTHS_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// weekday: 0=lunes .. 6=domingo (consistente con el motor de slots)
export function weekdayLabel(weekday) {
  return WEEKDAYS_LONG[weekday];
}

export function dateLine(plainDate) {
  // plainDate: Temporal.PlainDate
  const weekday = plainDate.dayOfWeek - 1;
  return `${capitalize(WEEKDAYS_LONG[weekday])} ${plainDate.day} de ${MONTHS_LONG[plainDate.month - 1]}`;
}

export function monthLabel(plainDate) {
  return `${capitalize(MONTHS_LONG[plainDate.month - 1])} ${plainDate.year}`;
}

export { WEEKDAYS_LONG, MONTHS_LONG };
