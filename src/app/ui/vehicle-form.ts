import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { resizeImage } from '../files';
import { TYPE_LABEL, VEHICLE_TYPES, type Vehicle, type VehicleType } from '../models';
import { Store } from '../store';
import { Sheet } from './sheet';

@Component({
  selector: 'app-vehicle-form',
  imports: [FormsModule, Sheet],
  template: `
    <app-sheet [title]="vehicle() ? 'Modifica veicolo' : 'Nuovo veicolo'" (close)="closed.emit()">
      <div class="photo-pick">
        <label class="photo" [class.empty]="!f.photo">
          @if (f.photo) {
            <img [src]="f.photo" alt="Foto del veicolo" />
          } @else {
            <span>📷 Aggiungi foto</span>
          }
          <input type="file" accept="image/*" hidden (change)="pickPhoto($event)" />
        </label>
        @if (f.photo) {
          <button type="button" class="link" (click)="f.photo = undefined">Rimuovi foto</button>
        }
      </div>

      <label class="field">
        <span>Nome</span>
        <input [(ngModel)]="f.name" placeholder="es. Panda" autocomplete="off" />
      </label>

      <div class="field">
        <span>Tipo</span>
        <div class="seg">
          @for (t of types; track t) {
            <button type="button" [class.on]="f.type === t" (click)="f.type = t">{{ typeLabel[t] }}</button>
          }
        </div>
      </div>

      <label class="field">
        <span>Targa</span>
        <input [(ngModel)]="f.plate" placeholder="AB123CD" autocapitalize="characters" autocomplete="off" />
      </label>

      <label class="field">
        <span>Data di immatricolazione</span>
        <input type="date" [(ngModel)]="f.registrationDate" />
      </label>
      <p class="hint">Serve per suggerirti la data della revisione.</p>

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
      <p class="hint">La media serve a stimare la data di un tagliando a km.</p>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      <button type="button" class="btn primary block" [disabled]="busy()" (click)="save()">Salva</button>
      @if (vehicle()) {
        <button type="button" class="btn danger block" (click)="remove()">Elimina veicolo</button>
      }
    </app-sheet>
  `,
})
export class VehicleForm implements OnInit {
  private readonly store = inject(Store);

  readonly vehicle = input<Vehicle | null>(null);
  readonly closed = output<void>();
  readonly saved = output<number>();
  readonly deleted = output<void>();

  protected readonly types = VEHICLE_TYPES;
  protected readonly typeLabel = TYPE_LABEL;
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected f: {
    name: string;
    plate: string;
    type: VehicleType;
    photo?: string;
    registrationDate: string;
    km: number | null;
    monthlyKm: number | null;
  } = { name: '', plate: '', type: 'auto', registrationDate: '', km: null, monthlyKm: null };

  ngOnInit(): void {
    const v = this.vehicle();
    if (v) {
      this.f = {
        name: v.name,
        plate: v.plate,
        type: v.type,
        photo: v.photo,
        registrationDate: v.registrationDate ?? '',
        km: v.km ?? null,
        monthlyKm: v.monthlyKm ?? null,
      };
    }
  }

  protected async pickPhoto(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      this.f.photo = await resizeImage(file);
      this.error.set('');
    } catch {
      this.error.set('Non riesco a leggere questa foto.');
    }
    input.value = '';
  }

  protected async save(): Promise<void> {
    if (!this.f.name.trim()) {
      this.error.set('Dai un nome al veicolo.');
      return;
    }
    this.busy.set(true);
    try {
      const base = this.vehicle();
      const v: Vehicle = {
        ...base,
        name: this.f.name.trim(),
        plate: this.f.plate.trim().toUpperCase(),
        type: this.f.type,
        photo: this.f.photo,
        registrationDate: this.f.registrationDate || undefined,
        km: this.f.km,
        monthlyKm: this.f.monthlyKm,
      };
      if (base) {
        await this.store.updateVehicle(v);
        this.saved.emit(base.id!);
      } else {
        this.saved.emit(await this.store.addVehicle(v));
      }
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const v = this.vehicle();
    if (!v) return;
    if (!confirm('Eliminare il veicolo e tutte le sue scadenze? L’operazione non si può annullare.')) return;
    await this.store.deleteVehicle(v.id!);
    this.deleted.emit();
  }
}
