export type VehicleType = 'auto' | 'moto' | 'furgone';
export type Category = 'bollo' | 'assicurazione' | 'revisione' | 'tagliando';
export type CalendarState = 'none' | 'synced' | 'outdated';
export type ServiceMode = 'date' | 'km' | 'both';
export type CalendarMode = 'share' | 'open';

export const VEHICLE_TYPES: VehicleType[] = ['auto', 'moto', 'furgone'];
export const TYPE_LABEL: Record<VehicleType, string> = { auto: 'Auto', moto: 'Moto', furgone: 'Furgone' };
export const TYPE_ICON: Record<VehicleType, string> = { auto: '🚗', moto: '🏍️', furgone: '🚐' };

export const CATEGORIES: Category[] = ['bollo', 'assicurazione', 'revisione', 'tagliando'];
export const CATEGORY_LABEL: Record<Category, string> = {
  bollo: 'Bollo',
  assicurazione: 'Assicurazione',
  revisione: 'Revisione',
  tagliando: 'Tagliando',
};

export interface Vehicle {
  id?: number;
  name: string;
  plate: string;
  type: VehicleType;
  /** Foto ridimensionata, come data URL JPEG */
  photo?: string;
  /** Data di immatricolazione (yyyy-mm-dd), serve per suggerire la revisione */
  registrationDate?: string;
  km?: number | null;
  /** Data (yyyy-mm-dd) dell'ultimo aggiornamento dei km */
  kmUpdatedAt?: string;
  /** Media di km percorsi al mese, per stimare la data di un tagliando a km */
  monthlyKm?: number | null;
}

export interface Suspension {
  from: string;
  to: string;
  days: number;
}

export interface Deadline {
  id?: number;
  vehicleId: number;
  category: Category;
  /** 'active' = scadenza corrente, 'history' = rinnovata/chiusa */
  status: 'active' | 'history';
  /** yyyy-mm-dd. Vuota per un tagliando solo a km. Per l'assicurazione è la scadenza effettiva. */
  dueDate: string;
  leadDays: number;
  notes: string;
  amount?: number | null;
  /** Identificatore stabile dell'evento nel file .ics */
  uid: string;
  /** Quante volte l'evento è stato generato (diventa SEQUENCE nell'.ics) */
  exports: number;
  calendarState: CalendarState;
  closedAt?: string;

  // Tagliando
  serviceMode?: ServiceMode;
  dueKm?: number | null;

  // Assicurazione
  suspendedFrom?: string;
  plannedReturn?: string;
  suspensions?: Suspension[];
  resumeExports?: number;
}

export interface LeadDefaults {
  bollo: number;
  assicurazione: number;
  revisione: number;
  tagliando: number;
  riattivazione: number;
}

export interface Settings {
  welcomeSeen: boolean;
  lead: LeadDefaults;
  calendarMode: CalendarMode;
  lastBackupAt?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  welcomeSeen: false,
  lead: { bollo: 15, assicurazione: 15, revisione: 30, tagliando: 30, riattivazione: 3 },
  calendarMode: 'share',
};

export function newUid(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
