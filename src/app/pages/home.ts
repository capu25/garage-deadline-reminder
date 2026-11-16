import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TYPE_ICON, TYPE_LABEL } from '../models';
import { daysBetween, summarize } from '../rules';
import { Store } from '../store';
import { VehicleForm } from '../ui/vehicle-form';

@Component({
  selector: 'app-home',
  imports: [RouterLink, VehicleForm],
  template: `
    <p class="eyebrow">01 / Veicoli</p>
    @if (store.vehicles().length === 0) {
      <section class="empty">
        <div class="big">🚗</div>
        <h1>Nessun veicolo</h1>
        <p>Aggiungi il tuo primo veicolo per tenere traccia di scadenze e manutenzioni.</p>
        <button type="button" class="btn primary" (click)="adding.set(true)">Aggiungi veicolo</button>
      </section>
    } @else {
      @if (backupText(); as t) {
        <a class="banner" routerLink="/settings">{{ t }}</a>
      }

      <ul class="list">
        @for (c of cards(); track c.v.id) {
          <li>
            <a class="card vehicle" [routerLink]="['/v', c.v.id]">
              <div class="thumb">
                @if (c.v.photo) {
                  <img [src]="c.v.photo" alt="" />
                } @else {
                  <span>{{ icon[c.v.type] }}</span>
                }
              </div>
              <div class="meta">
                <strong>{{ c.v.name }}</strong>
                <small>{{ typeLabel[c.v.type] }}{{ c.v.plate ? ' · ' + c.v.plate : '' }}</small>
                @if (c.s.next; as n) {
                  <span [class]="'pill ' + n.status">{{ n.text }}</span>
                } @else if (!c.s.insuranceSuspended) {
                  <span class="pill unknown">Nessuna scadenza</span>
                }
                @if (c.s.insuranceSuspended) {
                  <span class="pill suspended">Assicurazione sospesa</span>
                }
                @if (c.s.toCalendar > 0) {
                  <small class="warn-text">{{ c.s.toCalendar }} da aggiungere al calendario</small>
                }
              </div>
            </a>
          </li>
        }
      </ul>

      <button type="button" class="fab" aria-label="Aggiungi veicolo" (click)="adding.set(true)">＋</button>
    }

    @if (adding()) {
      <app-vehicle-form (closed)="adding.set(false)" (saved)="onSaved($event)" />
    }
  `,
})
export class HomePage {
  protected readonly store = inject(Store);
  private readonly router = inject(Router);

  protected readonly adding = signal(false);
  protected readonly icon = TYPE_ICON;
  protected readonly typeLabel = TYPE_LABEL;

  protected readonly cards = computed(() => {
    const today = this.store.today();
    const ds = this.store.deadlines();
    return this.store.vehicles().map((v) => ({
      v,
      s: summarize(v, ds.filter((d) => d.vehicleId === v.id && d.status === 'active'), today),
    }));
  });

  /** Promemoria di backup: mai fatto, o più di 30 giorni fa. */
  protected readonly backupText = computed(() => {
    const last = this.store.settings().lastBackupAt;
    if (!last) return 'Non hai ancora fatto un backup dei dati. Tocca per farlo.';
    const days = daysBetween(last.slice(0, 10), this.store.today());
    return days > 30 ? `Ultimo backup ${days} giorni fa. Tocca per rifarlo.` : '';
  });

  protected onSaved(id: number): void {
    this.adding.set(false);
    this.router.navigate(['/v', id]);
  }
}
