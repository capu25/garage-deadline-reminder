import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Store } from './store';
import { Welcome } from './ui/welcome';

type Theme = 'light' | 'dark';
const THEME_KEY = 'garage-theme';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, Welcome],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/">Garage<span class="dot">.</span></a>
      <span class="spacer"></span>
      <button type="button" class="icon-btn" aria-label="Cambia tema chiaro/scuro" (click)="toggleTheme()">
        {{ isDark() ? '☀︎' : '☾' }}
      </button>
      <button type="button" class="icon-btn" aria-label="Come funziona" (click)="showHelp.set(true)">?</button>
      <a class="icon-btn" routerLink="/settings" aria-label="Impostazioni">⚙︎</a>
    </header>

    @if (store.error(); as e) {
      <div class="banner err">{{ e }}</div>
    }

    <main>
      @if (store.ready()) {
        <router-outlet />
      }
    </main>

    @if (store.ready() && (!store.settings().welcomeSeen || showHelp())) {
      <app-welcome (done)="closeWelcome()" />
    }

    @if (store.toast(); as t) {
      <div class="toast" role="status">{{ t }}</div>
    }
  `,
})
export class App {
  protected readonly store = inject(Store);
  protected readonly showHelp = signal(false);
  /** null = segue il tema del telefono */
  private readonly theme = signal<Theme | null>(null);

  constructor() {
    // Se l'app resta aperta da un giorno all'altro, riallinea "oggi".
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.store.refreshToday();
    });

    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') this.applyTheme(saved);
    } catch {
      // storage non disponibile: si resta sul tema di sistema
    }
  }

  protected isDark(): boolean {
    const t = this.theme();
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  protected toggleTheme(): void {
    const next: Theme = this.isDark() ? 'light' : 'dark';
    this.applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // la scelta vale solo fino alla chiusura dell'app
    }
  }

  private applyTheme(t: Theme): void {
    this.theme.set(t);
    document.documentElement.dataset['theme'] = t;
  }

  protected async closeWelcome(): Promise<void> {
    this.showHelp.set(false);
    if (!this.store.settings().welcomeSeen) await this.store.saveSettings({ welcomeSeen: true });
  }
}
