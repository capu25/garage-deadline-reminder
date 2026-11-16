import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { deliver, slug } from '../files';
import { buildIcs, deadlineEvent, resumeEvent, type IcsEvent } from '../ics';
import {
  CATEGORIES,
  CATEGORY_LABEL,
  TYPE_ICON,
  TYPE_LABEL,
  type Category,
  type Deadline,
} from '../models';
import { describe, fmtDate, fmtKm } from '../rules';
import { Store } from '../store';
import { DeadlineForm } from '../ui/deadline-form';
import { InsuranceSheet } from '../ui/insurance-sheet';
import { Sheet } from '../ui/sheet';
import { VehicleForm } from '../ui/vehicle-form';

interface DeadlineFormState {
  cat: Category;
  deadline: Deadline | null;
  renewOf: Deadline | null;
}

@Component({
  selector: 'app-vehicle-detail',
  imports: [RouterLink, FormsModule, VehicleForm, DeadlineForm, InsuranceSheet, Sheet],
  template: `
    @if (vehicle(); as v) {
      <a class="back" routerLink="/">‹ Veicoli</a>

      <section class="hero">
        <div class="thumb big">
          @if (v.photo) {
            <img [src]="v.photo" alt="" />
          } @else {
            <span>{{ icon[v.type] }}</span>
          }
        </div>
        <div class="hero-meta">
          <h1>{{ v.name }}</h1>
          <p>{{ typeLabel[v.type] }}@if (v.plate) { · {{ v.plate }} }</p>
          @if (v.km != null) {
            <p class="muted">
              {{ km(v.km) }} · agg. {{ fmt(v.kmUpdatedAt) }}
              <button type="button" class="link" (click)="openKm()">Aggiorna</button>
            </p>
          } @else {
            <button type="button" class="link" (click)="openKm()">Imposta km attuali</button>
          }
        </div>
        <button type="button" class="btn small" (click)="editing.set(true)">Modifica</button>
      </section>

      @if (pending().length > 0) {
        <button type="button" class="btn primary block" (click)="addAll()">
          Aggiungi a calendario ({{ pending().length }})
        </button>
      }

      @for (s of sections(); track s.cat) {
        <section class="card sect">
          <header>
            <h2>{{ label[s.cat] }}</h2>
            @if (s.info; as i) {
              <span [class]="'pill ' + i.status">{{ i.label }}</span>
            }
          </header>

          @if (s.active; as d) {
            @if (s.info; as i) {
              <p class="detail">{{ i.detail }}</p>
            }
            @if (d.amount != null) {
              <p class="muted">€ {{ d.amount }}</p>
            }
            @if (d.notes) {
              <p class="muted">{{ d.notes }}</p>
            }

            @if (d.suspendedFrom) {
              <p class="cal">Scadenza congelata: l'evento già in calendario non cambia finché non riattivi.</p>
            } @else {
              <p class="cal" [class.warn]="d.calendarState !== 'synced'">
                @switch (d.calendarState) {
                  @case ('synced') {
                    ✓ In calendario
                  }
                  @case ('outdated') {
                    ⚠ Evento da aggiornare
                  }
                  @default {
                    ○ Non in calendario
                  }
                }
              </p>
            }

            <div class="actions">
              @if (!d.suspendedFrom) {
                <button type="button" class="btn small" [class.primary]="d.calendarState !== 'synced'" (click)="addOne(d)">
                  {{ d.calendarState === 'outdated' ? 'Aggiorna evento' : d.calendarState === 'synced' ? 'Rigenera evento' : 'Aggiungi a calendario' }}
                </button>
              }
              <button type="button" class="btn small" (click)="openForm(s.cat, d, null)">Modifica</button>
              @if (!d.suspendedFrom) {
                <button type="button" class="btn small" (click)="openForm(s.cat, null, d)">Rinnova</button>
              }
            </div>

            @if (s.cat === 'assicurazione') {
              <div class="actions">
                @if (d.suspendedFrom) {
                  <button type="button" class="btn small primary" (click)="ins.set({ mode: 'resume', d: d })">Riattiva</button>
                  @if (d.plannedReturn) {
                    <button type="button" class="btn small" (click)="addResume(d)">Promemoria riattivazione</button>
                  }
                } @else {
                  <button type="button" class="btn small" (click)="ins.set({ mode: 'suspend', d: d })">
                    {{ v.type === 'moto' ? 'Sospendi (moto ferma)' : 'Sospendi' }}
                  </button>
                }
              </div>
            }
          } @else {
            <p class="muted">Non impostata.</p>
            <div class="actions">
              <button type="button" class="btn small primary" (click)="openForm(s.cat, null, null)">Imposta</button>
            </div>
          }

          @if (s.history.length > 0) {
            <details class="history">
              <summary>Storico ({{ s.history.length }})</summary>
              <ul>
                @for (h of s.history; track h.id) {
                  <li>
                    {{ fmt(h.dueDate) }}
                    @if (h.dueKm != null) {
                      · {{ km(h.dueKm) }}
                    }
                    @if (h.amount != null) {
                      · € {{ h.amount }}
                    }
                    @if (h.notes) {
                      — {{ h.notes }}
                    }
                  </li>
                }
              </ul>
            </details>
          }
        </section>
      }

      @if (formState(); as f) {
        <app-deadline-form
          [vehicle]="v"
          [category]="f.cat"
          [deadline]="f.deadline"
          [renewOf]="f.renewOf"
          (closed)="formState.set(null)"
        />
      }

      @if (ins(); as x) {
        <app-insurance-sheet [mode]="x.mode" [deadline]="x.d" (closed)="ins.set(null)" />
      }

      @if (editing()) {
        <app-vehicle-form
          [vehicle]="v"
          (closed)="editing.set(false)"
          (saved)="editing.set(false)"
          (deleted)="editing.set(false)"
        />
      }

      @if (kmSheet()) {
        <app-sheet title="Km attuali" (close)="kmSheet.set(false)">
          <label class="field">
            <span>Km</span>
            <input type="number" inputmode="numeric" min="0" [(ngModel)]="kmValue" />
          </label>
          <p class="hint">Aggiornandoli, i tagliandi a km ricalcolano la data stimata.</p>
          <button type="button" class="btn primary block" (click)="saveKm()">Salva</button>
        </app-sheet>
      }
    }
  `,
})
export class VehicleDetailPage {
  protected readonly store = inject(Store);
  private readonly router = inject(Router);

  /** Parametro di rotta, legato tramite withComponentInputBinding */
  readonly id = input.required<string>();

  protected readonly icon = TYPE_ICON;
  protected readonly typeLabel = TYPE_LABEL;
  protected readonly label = CATEGORY_LABEL;
  protected readonly fmt = fmtDate;
  protected readonly km = fmtKm;

  protected readonly editing = signal(false);
  protected readonly kmSheet = signal(false);
  protected readonly formState = signal<DeadlineFormState | null>(null);
  protected readonly ins = signal<{ mode: 'suspend' | 'resume'; d: Deadline } | null>(null);
  protected kmValue: number | null = null;

  protected readonly vehicle = computed(() => this.store.vehicles().find((v) => v.id === Number(this.id())));

  protected readonly sections = computed(() => {
    const v = this.vehicle();
    if (!v) return [];
    const today = this.store.today();
    this.store.deadlines(); // dipendenza reattiva
    return CATEGORIES.map((cat) => {
      const active = this.store.activeOf(v.id!, cat) ?? null;
      return {
        cat,
        active,
        info: active ? describe(active, v, today) : null,
        history: this.store.historyOf(v.id!, cat),
      };
    });
  });

  /** Scadenze attive che non sono (più) in calendario e per cui si può generare un evento */
  protected readonly pending = computed(() => {
    const v = this.vehicle();
    if (!v) return [];
    return this.sections()
      .map((s) => s.active)
      .filter((d): d is Deadline => !!d && d.calendarState !== 'synced' && !!deadlineEvent(d, v));
  });

  constructor() {
    // Il dettaglio esiste solo per un veicolo esistente (anche dopo l'eliminazione).
    effect(() => {
      if (this.store.ready() && !this.vehicle()) this.router.navigateByUrl('/', { replaceUrl: true });
    });
  }

  protected openForm(cat: Category, deadline: Deadline | null, renewOf: Deadline | null): void {
    this.formState.set({ cat, deadline, renewOf });
  }

  protected openKm(): void {
    this.kmValue = this.vehicle()?.km ?? null;
    this.kmSheet.set(true);
  }

  protected async saveKm(): Promise<void> {
    const v = this.vehicle();
    if (!v) return;
    await this.store.updateVehicle({ ...v, km: this.kmValue });
    this.kmSheet.set(false);
  }

  // ---------- Calendario ----------
  // L'.ics si costruisce in modo sincrono e si consegna subito: iOS vuole la condivisione
  // direttamente dentro il tap. Lo stato nel database si aggiorna solo dopo.

  protected async addOne(d: Deadline): Promise<void> {
    const v = this.vehicle();
    if (!v) return;
    const ev = deadlineEvent(d, v);
    if (!ev) {
      this.store.notify('Mancano dati per calcolare la data.');
      return;
    }
    const result = await deliver(
      `${d.category}-${slug(v.name)}.ics`,
      'text/calendar',
      buildIcs([ev]),
      this.store.settings().calendarMode,
    );
    if (result !== 'cancelled') await this.store.markExported([d.id!]);
  }

  protected async addAll(): Promise<void> {
    const v = this.vehicle();
    if (!v) return;
    const list = this.pending();
    const events = list.map((d) => deadlineEvent(d, v)).filter((e): e is IcsEvent => e !== null);
    if (!events.length) return;
    const result = await deliver(
      `scadenze-${slug(v.name)}.ics`,
      'text/calendar',
      buildIcs(events),
      this.store.settings().calendarMode,
    );
    if (result !== 'cancelled') await this.store.markExported(list.map((d) => d.id!));
  }

  protected async addResume(d: Deadline): Promise<void> {
    const v = this.vehicle();
    if (!v) return;
    const ev = resumeEvent(d, v, this.store.settings().lead.riattivazione);
    if (!ev) return;
    const result = await deliver(
      `riattiva-assicurazione-${slug(v.name)}.ics`,
      'text/calendar',
      buildIcs([ev]),
      this.store.settings().calendarMode,
    );
    if (result !== 'cancelled') await this.store.markResumeExported(d.id!);
  }
}
