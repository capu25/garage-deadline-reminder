import { CATEGORY_LABEL, type Deadline, type Vehicle } from './models';
import { addDays, fmtDate, fmtKm, nextDate } from './rules';

export interface IcsEvent {
  uid: string;
  sequence: number;
  /** Giorno dell'evento (yyyy-mm-dd), evento "tutto il giorno" */
  date: string;
  /** Giorni di preavviso dell'avviso del Calendario (scatta alle 9:00) */
  leadDays: number;
  title: string;
  description: string;
}

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Piega le righe a 75 ottetti come richiesto dalla RFC 5545 (senza spezzare caratteri multibyte). */
function fold(line: string): string {
  const enc = new TextEncoder();
  let out = '';
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 74) {
      out += cur + '\r\n ';
      cur = '';
      bytes = 1;
    }
    cur += ch;
    bytes += b;
  }
  return out + cur;
}

const compact = (date: string) => date.replace(/-/g, '');

/**
 * Evento "tutto il giorno": l'avviso scatta alle 9:00 del giorno N prima.
 * Il trigger è relativo a mezzanotte del giorno dell'evento, quindi N giorni alle 9:00 = -P(N-1)DT15H.
 */
export function alarmTrigger(leadDays: number): string {
  return leadDays <= 0 ? 'PT9H' : `-P${leadDays - 1}DT15H`;
}

export function buildIcs(events: IcsEvent[], now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Garage//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${e.sequence}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(e.description)}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(e.date, 1))}`,
      'TRANSP:TRANSPARENT',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(e.title)}`,
      `TRIGGER:${alarmTrigger(e.leadDays)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function who(v: Vehicle): string {
  return v.name + (v.plate ? ` (${v.plate})` : '');
}

export function deadlineEvent(d: Deadline, v: Vehicle): IcsEvent | null {
  if (d.suspendedFrom) return null;
  const date = nextDate(d, v);
  if (!date) return null;

  const lines: string[] = [];
  if (d.category === 'tagliando') {
    const mode = d.serviceMode ?? 'date';
    if (mode !== 'date' && d.dueKm != null) lines.push(`Tagliando a ${fmtKm(d.dueKm)}.`);
    if (mode !== 'date' && v.km != null) {
      lines.push(`Km attuali: ${fmtKm(v.km)} (aggiornati il ${fmtDate(v.kmUpdatedAt)}). Data stimata dai km.`);
    }
  }
  if (d.notes) lines.push(d.notes);
  if (d.amount != null) lines.push(`Importo: € ${d.amount.toLocaleString('it-IT')}`);
  lines.push('Creato da Garage.');

  return {
    uid: `${d.uid}@garage.local`,
    sequence: d.exports,
    date,
    leadDays: d.leadDays,
    title: `${CATEGORY_LABEL[d.category]} · ${who(v)}`,
    description: lines.join('\n'),
  };
}

/** Promemoria "riattiva l'assicurazione" per una polizza sospesa con rientro previsto. */
export function resumeEvent(d: Deadline, v: Vehicle, leadDays: number): IcsEvent | null {
  if (!d.suspendedFrom || !d.plannedReturn) return null;
  return {
    uid: `${d.uid}-resume@garage.local`,
    sequence: d.resumeExports ?? 0,
    date: d.plannedReturn,
    leadDays,
    title: `Riattiva assicurazione · ${who(v)}`,
    description: 'Riattiva la polizza prima di rimettere il veicolo in strada.\nCreato da Garage.',
  };
}
