import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { deliver } from '../files';
import type { CalendarMode, LeadDefaults } from '../models';
import { fmtDate, todayIso } from '../rules';
import { Store } from '../store';

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink],
  template: `
    <a class="back" routerLink="/">‹ Veicoli</a>
    <h1>Impostazioni</h1>

    <section class="card pad">
      <h2>Preavviso predefinito</h2>
      <p class="hint">Giorni prima della scadenza a cui scatta l'avviso del Calendario. Ogni scadenza può cambiarlo.</p>
      @for (k of leadKeys; track k.key) {
        <label class="row">
          <span>{{ k.label }}</span>
          <input type="number" inputmode="numeric" min="0" [(ngModel)]="lead[k.key]" (change)="saveLead()" />
        </label>
      }
    </section>

    <section class="card pad">
      <h2>Passaggio al Calendario</h2>
      <div class="seg">
        <button type="button" [class.on]="mode() === 'share'" (click)="setMode('share')">Condividi</button>
        <button type="button" [class.on]="mode() === 'open'" (click)="setMode('open')">Apri direttamente</button>
      </div>
      <p class="hint">
        «Condividi» apre il foglio di iOS, dove scegli Calendario. Se non compare l'opzione giusta, prova «Apri direttamente».
      </p>
    </section>

    <section class="card pad">
      <h2>Backup</h2>
      <p class="hint">
        {{ store.settings().lastBackupAt ? 'Ultimo backup: ' + fmt(store.settings().lastBackupAt!.slice(0, 10)) : 'Non hai ancora fatto un backup.' }}
        Salva il file in File o iCloud Drive.
      </p>
      <div class="actions">
        <button type="button" class="btn primary" (click)="exportBackup()">Esporta backup</button>
        <label class="btn">
          Importa backup
          <input type="file" accept="application/json,.json" hidden (change)="importBackup($event)" />
        </label>
      </div>
      @if (message()) {
        <p class="hint">{{ message() }}</p>
      }
    </section>
  `,
})
export class SettingsPage {
  protected readonly store = inject(Store);
  protected readonly fmt = fmtDate;
  protected readonly message = signal('');
  protected readonly mode = () => this.store.settings().calendarMode;

  protected lead: LeadDefaults = { ...this.store.settings().lead };
  protected readonly leadKeys: { key: keyof LeadDefaults; label: string }[] = [
    { key: 'bollo', label: 'Bollo' },
    { key: 'assicurazione', label: 'Assicurazione' },
    { key: 'revisione', label: 'Revisione' },
    { key: 'tagliando', label: 'Tagliando' },
    { key: 'riattivazione', label: 'Riattivazione assicurazione' },
  ];

  protected async saveLead(): Promise<void> {
    const clean = { ...this.lead };
    for (const k of Object.keys(clean) as (keyof LeadDefaults)[]) {
      clean[k] = Math.max(0, Math.round(Number(clean[k]) || 0));
    }
    this.lead = clean;
    await this.store.saveSettings({ lead: clean });
  }

  protected async setMode(m: CalendarMode): Promise<void> {
    await this.store.saveSettings({ calendarMode: m });
  }

  protected async exportBackup(): Promise<void> {
    // Contenuto costruito in modo sincrono: la condivisione deve partire subito dentro il tap.
    const json = this.store.exportJson();
    const result = await deliver(`garage-backup-${todayIso()}.json`, 'application/json', json, 'share');
    if (result === 'cancelled') return;
    await this.store.saveSettings({ lastBackupAt: new Date().toISOString() });
    this.message.set('Backup esportato.');
  }

  protected async importBackup(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!confirm('Sostituire tutti i dati attuali con quelli del backup?')) return;
    try {
      const r = await this.store.importJson(await file.text());
      this.lead = { ...this.store.settings().lead };
      this.message.set(`Importati ${r.vehicles} veicoli e ${r.deadlines} scadenze.`);
    } catch (e) {
      this.message.set((e as Error).message);
    }
  }
}
