import { Component, output } from '@angular/core';
import { Sheet } from './sheet';

@Component({
  selector: 'app-welcome',
  imports: [Sheet],
  template: `
    <app-sheet title="Come funziona" [locked]="true">
      <ol class="steps">
        <li>
          <b>Aggiungi i tuoi veicoli</b>
          <span>Nome, tipo (auto, moto, furgone), foto e km. Dal dettaglio gestisci bollo, assicurazione, revisione e tagliando.</span>
        </li>
        <li>
          <b>Imposta le scadenze</b>
          <span>Per ognuna scegli la data e quanti giorni prima vuoi essere avvisato.</span>
        </li>
        <li>
          <b>Aggiungile al Calendario</b>
          <span>L'app non manda notifiche. Dopo aver salvato una scadenza tocca «Aggiungi a calendario» e conferma l'evento: l'avviso lo gestisce il Calendario. Finché non lo fai la scadenza resta segnata «Non in calendario».</span>
        </li>
        <li>
          <b>Se cambi qualcosa</b>
          <span>Tocca «Aggiorna evento». Se nel Calendario compare un doppione, elimina quello vecchio.</span>
        </li>
        <li>
          <b>Fai ogni tanto un backup</b>
          <span>I dati restano solo su questo iPhone. In Impostazioni esporta il backup e salvalo in File o iCloud Drive.</span>
        </li>
      </ol>
      <button type="button" class="btn primary block" (click)="done.emit()">Ho capito</button>
    </app-sheet>
  `,
})
export class Welcome {
  readonly done = output<void>();
}
