import { Injectable, signal } from '@angular/core';
import { db } from './db';
import {
  DEFAULT_SETTINGS,
  type Category,
  type Deadline,
  type Settings,
  type Vehicle,
} from './models';
import { addDays, daysBetween, eventChanged, todayIso } from './rules';

interface Backup {
  app: 'garage';
  version: 1;
  exportedAt: string;
  vehicles: Vehicle[];
  deadlines: Deadline[];
  settings: Settings;
}

function mergeSettings(s?: Partial<Settings> | null): Settings {
  return { ...DEFAULT_SETTINGS, ...s, lead: { ...DEFAULT_SETTINGS.lead, ...s?.lead } };
}

@Injectable({ providedIn: 'root' })
export class Store {
  readonly vehicles = signal<Vehicle[]>([]);
  readonly deadlines = signal<Deadline[]>([]);
  readonly settings = signal<Settings>(mergeSettings());
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);
  readonly toast = signal<string | null>(null);
  readonly today = signal(todayIso());

  private toastTimer?: ReturnType<typeof setTimeout>;

  async init(): Promise<void> {
    try {
      // Chiede al browser di non cancellare i dati quando serve spazio (non è garantito).
      navigator.storage?.persist?.().catch(() => undefined);
      await this.reload();
    } catch (e) {
      console.error(e);
      this.error.set('Impossibile aprire il database locale. In navigazione privata i dati non possono essere salvati.');
    }
    this.ready.set(true);
  }

  async reload(): Promise<void> {
    const [vehicles, deadlines, settings] = await Promise.all([
      db.vehicles.toArray(),
      db.deadlines.toArray(),
      db.settings.get('main'),
    ]);
    this.vehicles.set(vehicles);
    this.deadlines.set(deadlines);
    this.settings.set(mergeSettings(settings?.value));
  }

  refreshToday(): void {
    this.today.set(todayIso());
  }

  notify(message: string): void {
    this.toast.set(message);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }

  // ---------- Selettori ----------

  activeOf(vehicleId: number, category: Category): Deadline | undefined {
    return this.deadlines().find(
      (d) => d.vehicleId === vehicleId && d.category === category && d.status === 'active',
    );
  }

  historyOf(vehicleId: number, category: Category): Deadline[] {
    return this.deadlines()
      .filter((d) => d.vehicleId === vehicleId && d.category === category && d.status === 'history')
      .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''));
  }

  // ---------- Impostazioni ----------

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const next = mergeSettings({ ...this.settings(), ...patch });
    await db.settings.put({ key: 'main', value: next });
    this.settings.set(next);
  }

  // ---------- Veicoli ----------

  async addVehicle(v: Vehicle): Promise<number> {
    const toSave: Vehicle = { ...v, kmUpdatedAt: v.km != null ? todayIso() : undefined };
    const id = await db.vehicles.add(toSave);
    await this.reload();
    return id;
  }

  async updateVehicle(v: Vehicle): Promise<void> {
    const prev = await db.vehicles.get(v.id!);
    const kmChanged = (prev?.km ?? null) !== (v.km ?? null);
    const rateChanged = (prev?.monthlyKm ?? null) !== (v.monthlyKm ?? null);
    const next: Vehicle = { ...v };
    if (kmChanged) next.kmUpdatedAt = v.km != null ? todayIso() : undefined;

    await db.transaction('rw', db.vehicles, db.deadlines, async () => {
      await db.vehicles.put(next);
      if (kmChanged || rateChanged) {
        // La data stimata dei tagliandi a km può cambiare: gli eventi già in calendario vanno rigenerati.
        const ds = await db.deadlines.where('vehicleId').equals(v.id!).toArray();
        for (const d of ds) {
          if (
            d.status === 'active' &&
            d.category === 'tagliando' &&
            d.serviceMode !== 'date' &&
            d.calendarState === 'synced'
          ) {
            await db.deadlines.update(d.id!, { calendarState: 'outdated' });
          }
        }
      }
    });
    await this.reload();
  }

  async deleteVehicle(id: number): Promise<void> {
    await db.transaction('rw', db.vehicles, db.deadlines, async () => {
      await db.deadlines.where('vehicleId').equals(id).delete();
      await db.vehicles.delete(id);
    });
    await this.reload();
  }

  // ---------- Scadenze ----------

  /** Salva una scadenza. Se `renewing` è indicata, quella vecchia passa allo storico. */
  async saveDeadline(d: Deadline, renewing?: Deadline): Promise<void> {
    const toSave: Deadline = { ...d };
    const prev = d.id != null ? this.deadlines().find((x) => x.id === d.id) : undefined;
    if (prev && prev.calendarState === 'synced' && eventChanged(prev, toSave)) {
      toSave.calendarState = 'outdated';
    }
    await db.transaction('rw', db.deadlines, async () => {
      if (renewing?.id != null) {
        await db.deadlines.update(renewing.id, { status: 'history', closedAt: todayIso() });
      }
      if (toSave.id != null) await db.deadlines.put(toSave);
      else await db.deadlines.add(toSave);
    });
    await this.reload();
  }

  /** Da chiamare dopo aver consegnato il file .ics al Calendario. */
  async markExported(ids: number[]): Promise<void> {
    await db.transaction('rw', db.deadlines, async () => {
      for (const id of ids) {
        const d = await db.deadlines.get(id);
        if (d) await db.deadlines.update(id, { exports: d.exports + 1, calendarState: 'synced' });
      }
    });
    await this.reload();
  }

  async markResumeExported(id: number): Promise<void> {
    const d = await db.deadlines.get(id);
    if (d) await db.deadlines.update(id, { resumeExports: (d.resumeExports ?? 0) + 1 });
    await this.reload();
  }

  // ---------- Assicurazione: sospensione manuale ----------

  async suspend(d: Deadline, from: string, plannedReturn?: string): Promise<void> {
    await db.deadlines.update(d.id!, { suspendedFrom: from, plannedReturn: plannedReturn || undefined });
    await this.reload();
  }

  /** Riattiva la polizza. `newDue` è la nuova scadenza effettiva, già scelta o corretta a mano dall'utente. */
  async resume(d: Deadline, resumeDate: string, newDue: string): Promise<void> {
    if (!d.suspendedFrom) return;
    const days = Math.max(0, daysBetween(d.suspendedFrom, resumeDate));
    const suspensions = [...(d.suspensions ?? []), { from: d.suspendedFrom, to: resumeDate, days }];
    await db.deadlines.update(d.id!, {
      dueDate: newDue,
      suspensions,
      suspendedFrom: undefined,
      plannedReturn: undefined,
      resumeExports: undefined,
      calendarState: d.calendarState === 'synced' ? 'outdated' : d.calendarState,
    });
    await this.reload();
  }

  /** Nuova scadenza proposta alla riattivazione: scadenza attuale + giorni di sospensione. */
  proposedDueAfterResume(d: Deadline, resumeDate: string): string {
    const days = d.suspendedFrom ? Math.max(0, daysBetween(d.suspendedFrom, resumeDate)) : 0;
    return addDays(d.dueDate, days);
  }

  // ---------- Backup ----------

  exportJson(): string {
    const backup: Backup = {
      app: 'garage',
      version: 1,
      exportedAt: new Date().toISOString(),
      vehicles: this.vehicles(),
      deadlines: this.deadlines(),
      settings: this.settings(),
    };
    return JSON.stringify(backup);
  }

  async importJson(text: string): Promise<{ vehicles: number; deadlines: number }> {
    let data: Partial<Backup>;
    try {
      data = JSON.parse(text) as Partial<Backup>;
    } catch {
      throw new Error('Il file non è un JSON valido.');
    }
    if (data?.app !== 'garage' || !Array.isArray(data.vehicles) || !Array.isArray(data.deadlines)) {
      throw new Error('Questo file non sembra un backup di Garage.');
    }
    const vehicles = data.vehicles;
    const deadlines = data.deadlines;
    await db.transaction('rw', db.vehicles, db.deadlines, db.settings, async () => {
      await db.vehicles.clear();
      await db.deadlines.clear();
      await db.vehicles.bulkAdd(vehicles);
      await db.deadlines.bulkAdd(deadlines);
      if (data.settings) await db.settings.put({ key: 'main', value: mergeSettings(data.settings) });
    });
    await this.reload();
    return { vehicles: vehicles.length, deadlines: deadlines.length };
  }
}
