import { CATEGORY_LABEL, type Category, type Deadline, type Vehicle } from './models';

// ---------- Date (tutte come stringhe yyyy-mm-dd, calcoli in UTC per evitare problemi di ora legale) ----------

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

function parse(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}
function toMs(date: string): number {
  const [y, m, d] = parse(date);
  return Date.UTC(y, m - 1, d);
}
function toIso(ms: number): string {
  const t = new Date(ms);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}
export function addDays(date: string, n: number): string {
  return toIso(toMs(date) + n * DAY);
}
export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY);
}
export function addMonths(date: string, n: number): string {
  const [y, m, d] = parse(date);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const ty = first.getUTCFullYear();
  const tm = first.getUTCMonth();
  const last = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return toIso(Date.UTC(ty, tm, Math.min(d, last)));
}
export function endOfMonth(date: string): string {
  const [y, m] = parse(date);
  return toIso(Date.UTC(y, m, 0));
}
export function fmtDate(date?: string | null): string {
  if (!date) return '—';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}
export function fmtKm(n: number): string {
  return `${n.toLocaleString('it-IT')} km`;
}

// ---------- Tagliando a km: stima della data ----------

export function estimateKmDate(
  v: Pick<Vehicle, 'km' | 'kmUpdatedAt' | 'monthlyKm'>,
  dueKm: number | null | undefined,
): string | null {
  if (dueKm == null || v.km == null || !v.kmUpdatedAt || !v.monthlyKm || v.monthlyKm <= 0) return null;
  const left = dueKm - v.km;
  if (left <= 0) return v.kmUpdatedAt;
  const days = Math.ceil(left / (v.monthlyKm / 30.4375));
  return addDays(v.kmUpdatedAt, days);
}

/** Data usata per il calendario: per il tagliando è la prima tra data limite e data stimata dai km. */
export function nextDate(d: Deadline, v: Vehicle): string | null {
  if (d.category !== 'tagliando') return d.dueDate || null;
  const mode = d.serviceMode ?? 'date';
  const candidates: string[] = [];
  if (mode !== 'km' && d.dueDate) candidates.push(d.dueDate);
  if (mode !== 'date') {
    const est = estimateKmDate(v, d.dueKm);
    if (est) candidates.push(est);
  }
  if (!candidates.length) return null;
  return candidates.sort()[0];
}

// ---------- Stato e testi ----------

export type Status = 'ok' | 'soon' | 'overdue' | 'suspended' | 'unknown';

export interface Info {
  date: string | null;
  status: Status;
  label: string;
  detail: string;
}

export function relative(days: number): string {
  if (days < 0) return `${-days} gg di ritardo`;
  if (days === 0) return 'scade oggi';
  if (days === 1) return 'scade domani';
  if (days <= 60) return `tra ${days} gg`;
  return `tra ${Math.round(days / 30.4375)} mesi`;
}

function detailText(d: Deadline, v: Vehicle, date: string): string {
  if (d.category !== 'tagliando') {
    const extra = (d.suspensions ?? []).reduce((s, x) => s + x.days, 0);
    return `Scade il ${fmtDate(date)}` + (extra ? ` · include ${extra} gg di sospensione` : '');
  }
  const mode = d.serviceMode ?? 'date';
  const parts: string[] = [];
  if (mode !== 'km' && d.dueDate) parts.push(fmtDate(d.dueDate));
  if (mode !== 'date' && d.dueKm != null) parts.push(fmtKm(d.dueKm));
  let text = 'Entro ' + parts.join(' o ');
  if (mode !== 'date') {
    const est = estimateKmDate(v, d.dueKm);
    if (est) text += ` · stima dai km: ${fmtDate(est)}`;
  }
  return text;
}

export function describe(d: Deadline, v: Vehicle, today: string): Info {
  if (d.suspendedFrom) {
    return {
      date: d.dueDate || null,
      status: 'suspended',
      label: 'Sospesa',
      detail:
        `Sospesa dal ${fmtDate(d.suspendedFrom)}` +
        (d.plannedReturn ? ` · rientro previsto ${fmtDate(d.plannedReturn)}` : ''),
    };
  }
  const date = nextDate(d, v);
  if (!date) {
    return {
      date: null,
      status: 'unknown',
      label: 'Dati mancanti',
      detail: 'Servono km attuali e media mensile per stimare la data.',
    };
  }
  const diff = daysBetween(today, date);
  const status: Status = diff < 0 ? 'overdue' : diff <= d.leadDays ? 'soon' : 'ok';
  return { date, status, label: relative(diff), detail: detailText(d, v, date) };
}

export interface VehicleSummary {
  next: { category: Category; text: string; status: Status } | null;
  insuranceSuspended: boolean;
  /** Scadenze attive non ancora (o non più aggiornate) nel calendario */
  toCalendar: number;
}

export function summarize(v: Vehicle, active: Deadline[], today: string): VehicleSummary {
  let best: { date: string; category: Category; text: string; status: Status } | null = null;
  let insuranceSuspended = false;
  let toCalendar = 0;
  for (const d of active) {
    const info = describe(d, v, today);
    if (info.status === 'suspended') {
      insuranceSuspended = true;
      continue;
    }
    if (!info.date) continue;
    if (d.calendarState !== 'synced') toCalendar++;
    if (!best || info.date < best.date) {
      best = {
        date: info.date,
        category: d.category,
        text: `${CATEGORY_LABEL[d.category]} · ${info.label}`,
        status: info.status,
      };
    }
  }
  return {
    next: best ? { category: best.category, text: best.text, status: best.status } : null,
    insuranceSuspended,
    toCalendar,
  };
}

// ---------- Suggerimenti ----------

/**
 * Revisione: la prima entro 4 anni dall'immatricolazione, poi ogni 2 anni, entro la fine del mese.
 * È un suggerimento: la data esatta va verificata sul libretto / sull'ultimo tagliando di revisione.
 */
export function suggestRevisione(
  registration: string | undefined,
  lastDue: string | undefined,
  today: string,
): string | null {
  if (lastDue) return endOfMonth(addMonths(lastDue, 24));
  if (!registration) return null;
  let due = endOfMonth(addMonths(registration, 48));
  while (due < today) due = endOfMonth(addMonths(due, 24));
  return due;
}

export function suggestNext(category: Category, previousDue: string | undefined, today: string): string {
  const base = previousDue || today;
  let next = category === 'revisione' ? endOfMonth(addMonths(base, 24)) : addMonths(base, 12);
  if (next < today) next = category === 'revisione' ? endOfMonth(addMonths(today, 24)) : addMonths(today, 12);
  return next;
}

/** True se cambia qualcosa che finisce nell'evento di calendario. */
export function eventChanged(a: Deadline, b: Deadline): boolean {
  return (
    a.dueDate !== b.dueDate ||
    a.leadDays !== b.leadDays ||
    (a.serviceMode ?? null) !== (b.serviceMode ?? null) ||
    (a.dueKm ?? null) !== (b.dueKm ?? null) ||
    a.notes !== b.notes ||
    (a.amount ?? null) !== (b.amount ?? null)
  );
}
