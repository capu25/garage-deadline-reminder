import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Deadline } from '../models';
import { daysBetween, fmtDate, todayIso } from '../rules';
import { Store } from '../store';
import { Sheet } from './sheet';

/** Sospensione e riattivazione manuali dell'assicurazione (tipico per le moto ferme in inverno). */
@Component({
  selector: 'app-insurance-sheet',
  imports: [FormsModule, Sheet],
  template: `
    <app-sheet [title]="mode() === 'suspend' ? 'Sospendi assicurazione' : 'Riattiva assicurazione'" (close)="closed.emit()">
      @if (mode() === 'suspend') {
        <p class="note warn">
          Con la polizza sospesa il veicolo non può circolare. Il promemoria di scadenza resta congelato.
        </p>
        <label class="field">
          <span>Inizio sospensione</span>
          <input type="date" [(ngModel)]="from" />
        </label>
        <label class="field">
          <span>Rientro previsto (facoltativo)</span>
          <input type="date" [(ngModel)]="plannedReturn" />
        </label>
        <p class="hint">
          Se indichi il rientro potrai aggiungere al Calendario un promemoria per riattivare la polizza. L'evento di
          scadenza già in calendario non cambia finché non riattivi.
        </p>
      } @else {
        <p>
          Sospesa dal <b>{{ fmt(deadline().suspendedFrom) }}</b>
          · scadenza attuale <b>{{ fmt(deadline().dueDate) }}</b>.
        </p>
        <label class="field">
          <span>Data di riattivazione</span>
          <input type="date" [ngModel]="resumeDate" (ngModelChange)="onResumeDate($event)" />
        </label>
        <p class="hint">
          Giorni sospesi: <b>{{ days() }}</b>
        </p>
        <label class="field">
          <span>Nuova scadenza</span>
          <input type="date" [ngModel]="newDue" (ngModelChange)="newDue = $event; touched = true" />
        </label>
        <p class="hint">
          Proposta: scadenza attuale + giorni sospesi. Correggila a mano se la tua compagnia calcola in modo diverso.
        </p>
      }

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <button type="button" class="btn primary block" [disabled]="busy()" (click)="save()">
        {{ mode() === 'suspend' ? 'Sospendi' : 'Riattiva' }}
      </button>
    </app-sheet>
  `,
})
export class InsuranceSheet implements OnInit {
  private readonly store = inject(Store);

  readonly mode = input.required<'suspend' | 'resume'>();
  readonly deadline = input.required<Deadline>();
  readonly closed = output<void>();

  protected readonly fmt = fmtDate;
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected from = todayIso();
  protected plannedReturn = '';
  protected resumeDate = todayIso();
  protected newDue = '';
  protected touched = false;

  ngOnInit(): void {
    if (this.mode() === 'resume') this.newDue = this.store.proposedDueAfterResume(this.deadline(), this.resumeDate);
  }

  protected days(): number {
    const from = this.deadline().suspendedFrom;
    return from && this.resumeDate ? Math.max(0, daysBetween(from, this.resumeDate)) : 0;
  }

  protected onResumeDate(value: string): void {
    this.resumeDate = value;
    if (!this.touched && value) this.newDue = this.store.proposedDueAfterResume(this.deadline(), value);
  }

  protected async save(): Promise<void> {
    const d = this.deadline();
    if (this.mode() === 'suspend') {
      if (!this.from) return this.error.set('Indica da quando è sospesa.');
      if (this.plannedReturn && this.plannedReturn < this.from) {
        return this.error.set('Il rientro previsto non può essere prima dell’inizio.');
      }
    } else {
      if (!this.resumeDate || !this.newDue) return this.error.set('Compila data di riattivazione e nuova scadenza.');
      if (d.suspendedFrom && this.resumeDate < d.suspendedFrom) {
        return this.error.set('La riattivazione non può essere prima dell’inizio della sospensione.');
      }
    }

    this.busy.set(true);
    try {
      if (this.mode() === 'suspend') {
        await this.store.suspend(d, this.from, this.plannedReturn || undefined);
        this.store.notify('Assicurazione sospesa.');
      } else {
        await this.store.resume(d, this.resumeDate, this.newDue);
        this.store.notify('Riattivata. Aggiorna l’evento nel calendario.');
      }
      this.closed.emit();
    } finally {
      this.busy.set(false);
    }
  }
}
