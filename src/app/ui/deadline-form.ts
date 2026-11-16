import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CATEGORY_LABEL,
  newUid,
  type Category,
  type Deadline,
  type ServiceMode,
  type Vehicle,
} from '../models';
import {
  estimateKmDate,
  fmtDate,
  suggestNext,
  suggestRevisione,
  todayIso,
} from '../rules';
import { Store } from '../store';
import { Sheet } from './sheet';

@Component({
  selector: 'app-deadline-form',
  imports: [FormsModule, Sheet],
  template: `
    <app-sheet [title]="title()" (close)="closed.emit()">
      @if (category() === 'tagliando') {
        <div class="field">
          <span>Criterio</span>
          <div class="seg">
            @for (m of modes; track m.value) {
              <button type="button" [class.on]="f.serviceMode === m.value" (click)="f.serviceMode = m.value">
                {{ m.label }}
              </button>
            }
          </div>
        </div>
        @if (f.serviceMode === 'both') {
          <p class="hint">Scatta il primo dei due: la data o i km.</p>
        }
      }

      @if (showDate()) {
        <label class="field">
          <span>{{ category() === 'tagliando' ? 'Entro il' : 'Scadenza' }}</span>
          <input type="date" [(ngModel)]="f.dueDate" />
        </label>
        @if (suggestion(); as s) {
          @if (s !== f.dueDate) {
            <p class="hint">
              Suggerita: <b>{{ fmt(s) }}</b>
              <button type="button" class="link" (click)="f.dueDate = s">Usa</button>
            </p>
          }
        }
      }

      @if (category() === 'revisione') {
        @if (!vehicle().registrationDate && !renewOf() && !deadline()) {
          <p class="hint">Aggiungi la data di immatricolazione al veicolo per avere un suggerimento automatico.</p>
        }
        <p class="hint">
          Regola usata: la prima dopo 4 anni dall'immatricolazione, poi ogni 2, entro fine mese. Controlla sempre il libretto.
          @if (vehicle().type === 'furgone') {
            Per i mezzi sopra 3,5 t la revisione è annuale.
          }
        </p>
      }

      @if (category() === 'tagliando' && f.serviceMode !== 'date') {
        <label class="field">
          <span>Km del tagliando</span>
          <input type="number" inputmode="numeric" min="0" [(ngModel)]="f.dueKm" />
        </label>
        <div class="row2">
          <label class="field">
            <span>Km attuali</span>
            <input type="number" inputmode="numeric" min="0" [(ngModel)]="f.km" />
          </label>
          <label class="field">
            <span>Media km/mese</span>
            <input type="number" inputmode="numeric" min="0" [(ngModel)]="f.monthlyKm" />
          </label>
        </div>
        @if (effective(); as e) {
          <p class="hint">Data usata per il Calendario: <b>{{ fmt(e) }}</b></p>
        }
      }

      <label class="field">
        <span>Preavviso (giorni)</span>
        <input type="number" inputmode="numeric" min="0" [(ngModel)]="f.leadDays" />
      </label>
      <p class="hint">L'avviso del Calendario scatta alle 9:00, {{ f.leadDays || 0 }} giorni prima.</p>

      @if (category() === 'bollo' || category() === 'assicurazione') {
        <label class="field">
          <span>Importo (€, facoltativo)</span>
          <input type="number" inputmode="decimal" min="0" step="0.01" [(ngModel)]="f.amount" />
        </label>
      }

      <label class="field">
        <span>Note (facoltative)</span>
        <textarea rows="2" [(ngModel)]="f.notes" placeholder="es. numero polizza, officina"></textarea>
      </label>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <button type="button" class="btn primary block" [disabled]="busy()" (click)="save()">Salva</button>
    </app-sheet>
  `,
})
export class DeadlineForm implements OnInit {
  private readonly store = inject(Store);

  readonly vehicle = input.required<Vehicle>();
  readonly category = input.required<Category>();
  /** Scadenza da modificare */
  readonly deadline = input<Deadline | null>(null);
  /** Scadenza da rinnovare (finirà nello storico) */
  readonly renewOf = input<Deadline | null>(null);
  readonly closed = output<void>();

  protected readonly fmt = fmtDate;
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly modes: { value: ServiceMode; label: string }[] = [
    { value: 'date', label: 'Data' },
    { value: 'km', label: 'Km' },
    { value: 'both', label: 'Entrambi' },
  ];

  protected readonly title = computed(() => {
    const label = CATEGORY_LABEL[this.category()];
    if (this.renewOf()) return `Rinnova ${label.toLowerCase()}`;
    if (this.deadline()) return `Modifica ${label.toLowerCase()}`;
    return `Imposta ${label.toLowerCase()}`;
  });

  protected f = {
    dueDate: '',
    leadDays: 15 as number | null,
    notes: '',
    amount: null as number | null,
    serviceMode: 'date' as ServiceMode,
    dueKm: null as number | null,
    km: null as number | null,
    monthlyKm: null as number | null,
  };

  ngOnInit(): void {
    const v = this.vehicle();
    const cat = this.category();
    const edit = this.deadline();
    const renew = this.renewOf();
    const src = edit ?? renew;

    this.f.leadDays = src?.leadDays ?? this.store.settings().lead[cat];
    this.f.serviceMode = src?.serviceMode ?? 'date';
    this.f.km = v.km ?? null;
    this.f.monthlyKm = v.monthlyKm ?? null;

    if (edit) {
      this.f.dueDate = edit.dueDate;
      this.f.notes = edit.notes;
      this.f.amount = edit.amount ?? null;
      this.f.dueKm = edit.dueKm ?? null;
    } else {
      this.f.dueDate = this.suggestion() ?? '';
    }
  }

  protected showDate(): boolean {
    return this.category() !== 'tagliando' || this.f.serviceMode !== 'km';
  }

  /** Data suggerita (solo per nuove scadenze e rinnovi). */
  protected suggestion(): string | null {
    if (this.deadline()) return null;
    const v = this.vehicle();
    const cat = this.category();
    const renew = this.renewOf();
    const today = todayIso();
    if (cat === 'revisione') return suggestRevisione(v.registrationDate, renew?.dueDate || undefined, today);
    if (renew) return suggestNext(cat, renew.dueDate || undefined, today);
    return null;
  }

  /** Data che finirà nel Calendario, in base ai valori inseriti. */
  protected effective(): string | null {
    if (this.category() !== 'tagliando') return this.f.dueDate || null;
    const v = this.vehicle();
    const dates: string[] = [];
    if (this.f.serviceMode !== 'km' && this.f.dueDate) dates.push(this.f.dueDate);
    if (this.f.serviceMode !== 'date') {
      const kmChanged = this.f.km !== (v.km ?? null);
      const est = estimateKmDate(
        { km: this.f.km, kmUpdatedAt: kmChanged ? todayIso() : v.kmUpdatedAt, monthlyKm: this.f.monthlyKm },
        this.f.dueKm,
      );
      if (est) dates.push(est);
    }
    return dates.sort()[0] ?? null;
  }

  private validate(): string | null {
    const tag = this.category() === 'tagliando';
    const mode = this.f.serviceMode;
    if ((!tag || mode !== 'km') && !this.f.dueDate) return 'Inserisci la data di scadenza.';
    if (tag && mode !== 'date') {
      if (!this.f.dueKm || this.f.dueKm <= 0) return 'Inserisci i km del tagliando.';
      if (this.f.km == null) return 'Inserisci i km attuali.';
      if (!this.f.monthlyKm || this.f.monthlyKm <= 0) return 'Inserisci la media di km al mese per stimare la data.';
    }
    if (!this.effective()) return 'Non riesco a calcolare una data per il Calendario.';
    return null;
  }

  protected async save(): Promise<void> {
    const err = this.validate();
    if (err) {
      this.error.set(err);
      return;
    }
    this.busy.set(true);
    try {
      const v = this.vehicle();
      const cat = this.category();
      const tag = cat === 'tagliando';
      const base = this.deadline();

      const d: Deadline = base
        ? { ...base }
        : {
            vehicleId: v.id!,
            category: cat,
            status: 'active',
            dueDate: '',
            leadDays: 0,
            notes: '',
            uid: newUid(),
            exports: 0,
            calendarState: 'none',
          };

      d.serviceMode = tag ? this.f.serviceMode : undefined;
      d.dueDate = tag && this.f.serviceMode === 'km' ? '' : this.f.dueDate;
      d.dueKm = tag && this.f.serviceMode !== 'date' ? this.f.dueKm : undefined;
      d.leadDays = Math.max(0, Math.round(this.f.leadDays ?? 0));
      d.notes = this.f.notes.trim();
      d.amount = cat === 'bollo' || cat === 'assicurazione' ? this.f.amount : undefined;

      // Prima la scadenza, poi il veicolo: se i km cambiano, l'aggiornamento del veicolo
      // segna questa scadenza come "da aggiornare" nel calendario.
      await this.store.saveDeadline(d, this.renewOf() ?? undefined);
      if (tag && this.f.serviceMode !== 'date' && (this.f.km !== (v.km ?? null) || this.f.monthlyKm !== (v.monthlyKm ?? null))) {
        await this.store.updateVehicle({ ...v, km: this.f.km, monthlyKm: this.f.monthlyKm });
      }
      this.store.notify('Salvata. Ora aggiungila al calendario.');
      this.closed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
