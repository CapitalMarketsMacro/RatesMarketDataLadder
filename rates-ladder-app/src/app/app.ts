import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RatesLadderComponent } from './rates-ladder/rates-ladder.component';

/** Demo shell — README §6. Mounts the three ladder variants side by side. */
@Component({
  selector: 'app-root',
  imports: [RatesLadderComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly ticking = signal(true);
  protected readonly showVAP = signal(false);
  protected readonly theme   = signal<'dark' | 'light'>('dark');

  protected readonly stdWidth = computed(() => this.showVAP() ? 580 : 360);
  protected readonly proWidth = computed(() => this.showVAP() ? 640 : 420);
  protected readonly anaWidth = computed(() => this.showVAP() ? 740 : 520);

  protected toggleTicking(ev: Event) { this.ticking.set((ev.target as HTMLInputElement).checked); }
  protected toggleVAP(ev: Event)     { this.showVAP.set((ev.target as HTMLInputElement).checked); }
  protected setTheme(ev: Event)      { this.theme.set((ev.target as HTMLSelectElement).value as 'dark' | 'light'); }
}
