import { Component, DestroyRef, inject, input, output } from '@angular/core';

let openSheets = 0;

/** Pannello che sale dal basso, usato per tutte le modali. */
@Component({
  selector: 'app-sheet',
  template: `
    <div class="backdrop" (click)="!locked() && close.emit()"></div>
    <section class="sheet" role="dialog" aria-modal="true" [attr.aria-label]="title()">
      <header class="sheet-head">
        <h2>{{ title() }}</h2>
        @if (!locked()) {
          <button type="button" class="icon-btn" aria-label="Chiudi" (click)="close.emit()">✕</button>
        }
      </header>
      <div class="sheet-body"><ng-content /></div>
    </section>
  `,
})
export class Sheet {
  readonly title = input.required<string>();
  /** Se true non si chiude toccando fuori e non c'è la ✕ (serve un pulsante esplicito). */
  readonly locked = input(false);
  readonly close = output<void>();

  constructor() {
    openSheets++;
    document.body.classList.add('sheet-open');
    inject(DestroyRef).onDestroy(() => {
      openSheets--;
      if (openSheets <= 0) document.body.classList.remove('sheet-open');
    });
  }
}
