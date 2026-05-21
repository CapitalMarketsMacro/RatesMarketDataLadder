import { Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, type Message } from 'amps';
import type { MarketData, Product, VapPrint } from './rates-ladder.types';

export interface AmpsConnectOptions {
  url: string;
  marketDataTopic: string;
  vapTopic: string;
  productsTopic: string;
  clientName?: string;
}

type ConnState = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Thin Angular wrapper around the 60East AMPS JS client.
 * Subscribes to three SOW topics declared in the AMPS instance config:
 *   - products           (key: /Id) — IsOTR='true' filter for on-the-run set
 *   - rates_market_data  (keys: /Id, /MarketId) — filtered per selected /Id
 *   - rates_vap          (keys: /Id, /ECN, /TradePrice) — filtered per selected /Id
 */
@Injectable({ providedIn: 'root' })
export class AmpsService {
  readonly products$   = new Subject<Product>();
  readonly marketData$ = new Subject<MarketData>();
  readonly vapPrint$   = new Subject<VapPrint>();

  readonly state     = signal<ConnState>('idle');
  readonly lastError = signal<string | null>(null);
  readonly connected = signal(false);
  readonly stats     = signal<{ products: number; mdMsgs: number; vapMsgs: number }>({
    products: 0, mdMsgs: 0, vapMsgs: 0,
  });

  private client: Client | null = null;
  private productsSubId: string | null = null;
  private mdSubId: string | null = null;
  private vapSubId: string | null = null;
  private mdTopic = '';
  private vapTopic = '';
  private currentProductId: number | null = null;

  async connect(opts: AmpsConnectOptions): Promise<void> {
    await this.disconnect();
    this.state.set('connecting');
    this.lastError.set(null);
    this.mdTopic = opts.marketDataTopic;
    this.vapTopic = opts.vapTopic;

    const client = new Client(opts.clientName ?? 'rates-ladder-web');
    client.errorHandler((err) => {
      this.lastError.set(err?.message ?? String(err));
      console.warn('[AMPS] error:', err);
    });
    client.disconnectHandler(() => {
      this.connected.set(false);
      this.state.set('disconnected');
    });
    this.client = client;

    try {
      await client.connect(opts.url);
      this.connected.set(true);
      this.state.set('connected');

      this.productsSubId = await client.sowAndSubscribe(
        (m: Message) => this.handleProduct(m),
        opts.productsTopic,
        `/IsOTR = 'true'`,
      );
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      this.lastError.set(msg);
      this.state.set('error');
      this.connected.set(false);
      console.error('[AMPS] connect failed:', err);
      throw err;
    }
  }

  /** Swap market-data and VAP subscriptions to the given product Id.
   *  Tears down previous sub before placing the new one. */
  async setProduct(productId: number): Promise<void> {
    if (!this.client || !this.connected()) return;
    if (this.currentProductId === productId) return;
    this.currentProductId = productId;

    if (this.mdSubId) {
      try { await this.client.unsubscribe(this.mdSubId); } catch { /* ignore */ }
      this.mdSubId = null;
    }
    if (this.vapSubId) {
      try { await this.client.unsubscribe(this.vapSubId); } catch { /* ignore */ }
      this.vapSubId = null;
    }

    try {
      this.mdSubId = await this.client.sowAndSubscribe(
        (m: Message) => this.handleMarketData(m),
        this.mdTopic,
        `/Id = ${productId}`,
      );
      this.vapSubId = await this.client.sowAndSubscribe(
        (m: Message) => this.handleVap(m),
        this.vapTopic,
        `/Id = ${productId}`,
      );
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      this.lastError.set(msg);
      console.error('[AMPS] setProduct failed:', err);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.client) return;
    try { await this.client.disconnect(); } catch { /* ignore */ }
    this.client = null;
    this.productsSubId = null;
    this.mdSubId = null;
    this.vapSubId = null;
    this.currentProductId = null;
    this.connected.set(false);
    this.state.set('disconnected');
  }

  private handleProduct(m: Message): void {
    const data = m?.data;
    if (this.looksLikeProduct(data)) {
      this.stats.update(s => ({ ...s, products: s.products + 1 }));
      this.products$.next(data);
    }
  }

  private handleMarketData(m: Message): void {
    const data = m?.data;
    if (this.looksLikeMarketData(data)) {
      this.stats.update(s => ({ ...s, mdMsgs: s.mdMsgs + 1 }));
      this.marketData$.next(data);
    }
  }

  private handleVap(m: Message): void {
    const data = m?.data;
    if (this.looksLikeVapPrint(data)) {
      this.stats.update(s => ({ ...s, vapMsgs: s.vapMsgs + 1 }));
      this.vapPrint$.next(data);
    }
  }

  private looksLikeProduct(d: unknown): d is Product {
    const o = d as Partial<Product> | null;
    return !!o && typeof o === 'object'
      && typeof o.Id === 'number'
      && typeof o.Desc === 'string'
      && typeof o.IsOTR === 'boolean';
  }

  private looksLikeMarketData(d: unknown): d is MarketData {
    const o = d as Partial<MarketData> | null;
    return !!o && typeof o === 'object' && Array.isArray(o.Bid) && Array.isArray(o.Ask);
  }

  private looksLikeVapPrint(d: unknown): d is VapPrint {
    const o = d as Partial<VapPrint> | null;
    return !!o && typeof o === 'object'
      && typeof o.TradePrice === 'number'
      && typeof o.TradeSize === 'number';
  }
}
