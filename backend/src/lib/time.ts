/** Conversión de hora local del negocio (zona IANA) a instante UTC. Sin dependencias. */

/** Diferencia (ms) entre la hora local de `tz` y UTC en el instante `ts`. */
function tzOffsetMs(ts: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ts));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/**
 * Convierte "2026-10-30" + "08:00[:00]" en la zona del negocio al instante UTC.
 * Ej.: 08:00 en America/Bogota => 13:00Z.
 */
export function zonedToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = tzOffsetMs(guess, tz);
  let utc = guess - first;
  const second = tzOffsetMs(utc, tz);
  if (second !== first) utc = guess - second; // cruce de horario de verano
  return new Date(utc);
}
