import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AmpsService } from './amps.service';
import type { Product } from './rates-ladder.types';

/**
 * Maintains the on-the-run product universe from the AMPS `products` topic.
 * Ingests Product snapshots/updates into a Map keyed on /Id and exposes a
 * sorted signal for the searchable picker plus the currently selected Id.
 */
@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly amps = inject(AmpsService);
  private readonly _products = new Map<number, Product>();

  readonly products    = signal<Product[]>([]);
  readonly selectedId  = signal<number | null>(null);
  readonly selected    = computed<Product | null>(() => {
    const id = this.selectedId();
    return id != null ? (this._products.get(id) ?? null) : null;
  });

  private sub: Subscription | null = null;

  /** Begin ingesting product updates from AMPS. Idempotent. */
  attach(): void {
    if (this.sub) return;
    this.sub = this.amps.products$.subscribe((p) => this.ingest(p));
  }

  detach(): void {
    this.sub?.unsubscribe();
    this.sub = null;
  }

  /** Wipe the product universe — used when reverting to simulator mode. */
  reset(): void {
    this._products.clear();
    this.products.set([]);
    this.selectedId.set(null);
  }

  /** Programmatically pick a product by Id. */
  select(id: number): void {
    if (this._products.has(id)) this.selectedId.set(id);
  }

  private ingest(p: Product): void {
    if (!p.IsOTR) return;
    this._products.set(p.Id, p);
    this.products.set(
      [...this._products.values()].sort((a, b) => {
        if (a.SortKey && b.SortKey) return a.SortKey.localeCompare(b.SortKey);
        return a.Tenor - b.Tenor;
      }),
    );
    // Auto-select the first product to arrive so the ladder has something to show.
    if (this.selectedId() == null) this.selectedId.set(p.Id);
  }
}
