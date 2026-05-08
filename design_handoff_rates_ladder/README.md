# Handoff: Rates Market Data Ladder (Angular Port)

> **Target framework: Angular 21 (standalone components, signals, zoneless change detection, new control flow `@if`/`@for`).**
> The bundled `*.html` / `*.jsx` files in `design_reference/` are **design references created in HTML/React** — prototypes showing intended look, layout, and behavior. **Do not ship them.** Your job is to **recreate the design 1:1 as an Angular standalone component** using the codebase's existing patterns. If there is no existing Angular project, scaffold a fresh one (instructions in §1).

---

## 0. TL;DR for Claude Code

You are implementing a **rates trading price ladder** ("MD Trader") in Angular. It subscribes to a CLOB market-data feed (bids/asks per price level) and a Volume-At-Price feed, and renders a vertically-stacked grid of price rows with bid qty | price | ask qty | VAP analytics. There are **three variants** (`standard`, `pro`, `analytics`) selected via an `@Input()`. Live-tick simulation is acceptable for v1; real WebSocket wiring is §7.

Work in this order:
1. Scaffold the Angular workspace (§1).
2. Create design tokens / global styles (§2).
3. Build domain types + services (§3, §4).
4. Build the `<rates-ladder>` component and its sub-components (§5).
5. Add the demo shell that mounts all three variants side-by-side (§6).
6. (Optional) Wire real AMPS WebSocket (§7).

Read **every** section before writing code. Do not skip the design-token step — every color/spacing value comes from there.

---

## 1. Project Setup

### 1.0 Verified toolchain

This handoff was authored against:

| Tool          | Version   |
| ------------- | --------- |
| Node.js       | 22.15.0   |
| npm           | 11.12.1   |
| Angular CLI   | 21.2.9    |

Confirm before scaffolding:

```bash
node -v        # v22.15.0
npm -v         # 11.12.1
ng version     # Angular CLI: 21.2.9
```

### 1.1 Scaffold (Angular 21)

```bash
# Install (or upgrade) the CLI globally to the matching major
npm install -g @angular/cli@21

# Angular 21 defaults: standalone components, signals, new control flow,
# zoneless change detection, SCSS, no SSR.
ng new rates-ladder-app \
  --style=scss \
  --routing=false \
  --ssr=false \
  --skip-tests=false \
  --package-manager=npm
cd rates-ladder-app
```

> Notes on Angular 21 defaults:
> - `--standalone` is no longer a flag — standalone is the default and only mode in 21.
> - The generated `app.config.ts` uses `provideZonelessChangeDetection()` (zone.js is opt-in). Keep zoneless — signals are already the data spine of this design, and OnPush is implicit.
> - The new control flow (`@if` / `@for` / `@switch`) is the default in templates; do **not** use `*ngIf` / `*ngFor`.
> - `provideHttpClient()` and `provideRouter()` are added on demand.

### 1.2 Add dependencies

```bash
# RxJS ships with the Angular 21 default; no manual install needed.
# Only extra you might want for AMPS WebSocket typings:
npm install --save-dev @types/node
```

No UI kit (Material/Tailwind). All styling is hand-rolled SCSS using the design tokens in §2 — this matches the reference exactly and keeps the bundle small.

### 1.3 Generate the component & services

Use the CLI so files land in the right place with the v21 standalone shape:

```bash
ng generate component rates-ladder/rates-ladder --change-detection=OnPush --display-block
ng generate service   rates-ladder/market-data
ng generate service   rates-ladder/vap

# sub-components
ng generate component rates-ladder/partials/ladder-header   --change-detection=OnPush
ng generate component rates-ladder/partials/ladder-body     --change-detection=OnPush
ng generate component rates-ladder/partials/ladder-footer   --change-detection=OnPush
ng generate component rates-ladder/partials/analytics-rail  --change-detection=OnPush
ng generate component rates-ladder/partials/working-strip   --change-detection=OnPush
ng generate component rates-ladder/partials/sparkline       --change-detection=OnPush
ng generate component rates-ladder/partials/depth-bar       --change-detection=OnPush
```

### 1.3 Final folder structure (target)

```
src/
  app/
    app.component.ts                 # demo shell (3 ladders side-by-side)
    app.component.html
    app.component.scss
    app.config.ts
    rates-ladder/
      rates-ladder.component.ts      # main component
      rates-ladder.component.html
      rates-ladder.component.scss
      rates-ladder.types.ts          # MarketData, VapEntry, etc.
      rates-ladder.utils.ts          # fmtPx, fmtQty, buildRows
      market-data.service.ts         # feeds payload + tick simulation
      vap.service.ts                 # Volume-At-Price aggregation
      partials/
        ladder-header.component.ts   # KPI strip + sparkline
        ladder-body.component.ts     # the price grid
        ladder-footer.component.ts   # size buttons + Buy/CXL/Sell
        analytics-rail.component.ts  # right-side KPI rail (analytics variant)
        working-strip.component.ts   # working-orders strip (pro variant)
        sparkline.component.ts       # tiny inline SVG sparkline
        depth-bar.component.ts       # absolute-positioned depth fill
  styles/
    _tokens.scss                     # design tokens (CSS vars)
    _typography.scss
    _reset.scss
  styles.scss                        # imports the above
```

---

## 2. Design Tokens

All colors, spacing, fonts must match these values. Define them as CSS custom properties on `:root` in `src/styles/_tokens.scss` and import from `styles.scss`.

### 2.1 Colors — Dark theme (default)

```scss
:root {
  /* surfaces */
  --bg-app:        #0b0d10;
  --bg-canvas:     #11151a;
  --bg-panel:      #161b22;
  --bg-elev:       #1c222b;

  /* foreground */
  --fg-1:          #e6edf3;   /* primary text */
  --fg-2:          #b1bac4;   /* secondary */
  --fg-3:          #7d8590;   /* tertiary / labels */

  /* borders */
  --border-1:      #21262d;
  --border-2:      #30363d;
  --border-grid:   rgba(255,255,255,0.04);

  /* market semantic */
  --bid:           #3fb950;   /* green-500 */
  --bid-bg:        rgba(63,185,80,0.10);
  --ask:           #f85149;   /* red-500  */
  --ask-bg:        rgba(248,81,73,0.10);
  --mkt-up:        #3fb950;
  --mkt-down:      #f85149;

  /* accent */
  --brand:         #f0b429;   /* Macro yellow */
  --brand-soft:    rgba(240,180,41,0.14);
  --on-brand:      #11151a;
  --yellow-300:    #f5c13a;

  /* fonts */
  --font-sans: "Inter", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", Menlo, monospace;
}

.theme-light {
  --bg-app: #ffffff;     --bg-canvas: #f7f8fa;   --bg-panel: #ffffff;
  --bg-elev: #f1f3f5;
  --fg-1:  #0d1117;      --fg-2: #4b5563;        --fg-3: #6b7280;
  --border-1: #e5e7eb;   --border-2: #d1d5db;    --border-grid: rgba(0,0,0,0.04);
  --bid-bg: rgba(63,185,80,0.12);  --ask-bg: rgba(248,81,73,0.12);
  --on-brand: #11151a;
}
```

### 2.2 Spacing & sizing

| Token        | Value | Usage                          |
| ------------ | ----- | ------------------------------ |
| Row height   | 22px  | Each price row in the ladder   |
| Header strip | 56px  | KPI strip above the body       |
| Window chrome| 28px  | Title bar at top               |
| Footer       | ~88px | Size buttons + Buy/CXL/Sell    |
| Status strip | 22px  | Bottom AMPS/rev/clock          |
| Border radius| 8px   | Outer container                |
| Border radius| 2px   | Order chips, inline tags       |

### 2.3 Typography

- **Body / labels**: Inter 11–12px, `.label` class is 10px / `letter-spacing: 0.06em` / uppercase / `var(--fg-3)`.
- **Numbers**: JetBrains Mono 11px (everything in the grid — prices, qtys, VAP). `font-variant-numeric: tabular-nums` is critical for column alignment.
- **Title bar**: Inter 11px / 500.
- **Footer Buy/Sell buttons**: 12px / 600.

### 2.4 Animation tokens

- Cell flash: 600ms, `flash-up` → green tint pulse, `flash-down` → red tint pulse. Define as `@keyframes` on the row element.

```scss
@keyframes flash-up   { 0% { background: rgba(63,185,80,0.30); } 100% { background: transparent; } }
@keyframes flash-down { 0% { background: rgba(248,81,73,0.30); } 100% { background: transparent; } }
.flash-up   { animation: flash-up   600ms ease-out; }
.flash-down { animation: flash-down 600ms ease-out; }
```

---

## 3. Domain Types

`src/app/rates-ladder/rates-ladder.types.ts`:

```typescript
// AMPS L2 payload (rubiconCLOBProd/clobL2)
export interface BookLevel {
  Price: number;
  Qty: number;
  Source?: number[];
  Status?: number;
}

export interface MarketData {
  Id: number;
  MarketId: number;
  UnderlyingMarketId: number;
  DV01: number;
  Time: number;                      // epoch ms
  LastTradePrice: number;
  LastTradeSize: number;
  LastTradeSource: number;
  LastTradeTime: number;
  LastTradeSide: 'BUY' | 'SELL';
  HighTradePrice: number;
  LowTradePrice: number;
  RefPrice: number;
  RevisionId: number;
  RevisionTime: number;
  BidSubTickQuantity: number;
  AskSubTickQuantity: number;
  BidPricesUsed: number;
  BidYield: number;                  // decimal (e.g. 0.0436)
  Bid: BookLevel[];                  // descending price
  AskPricesUsed: number;
  AskYield: number;
  Ask: BookLevel[];                  // ascending price
  ProductGroup: number;
}

// AMPS clobVAP payload (raw print)
export interface VapPrint {
  Id: number;
  ECN: number;
  TradeTime: number;
  TradePrice: number;
  TradeSize: number;
  RecordId: number;
  MarketAskVol: number;
  MarketBidVolume: number;
  MarketOtherVolume: number;
  ProductGroup: number;
}

// Aggregated per-price (client-side)
export interface VapEntry {
  total: number;
  buy: number;
  sell: number;
  other: number;
  time: string;                      // wall-clock formatted (e.g. "11:09:44 AM")
}

export interface WorkingOrder {
  side: 'BUY' | 'SELL';
  price: number;
  qty: number;
  status: 'working' | 'cancelled' | 'filled';
}

export type LadderVariant = 'standard' | 'pro' | 'analytics';

export interface LadderRow {
  price: number;
  bidQty: number | null;
  askQty: number | null;
  sources: number[];
  isBestBid: boolean;
  isBestAsk: boolean;
  isLast: boolean;
  isHigh: boolean;
  isLow: boolean;
  isRefBand: boolean;
}
```

### 3.1 Tick size

UST futures: `TICK = 1/64 = 0.015625`. Make it a `readonly` constant on the component, but accept an `@Input() tickSize` override for other product groups.

### 3.2 Price formatting (32nds)

Treasuries display in 32nds with optional half-tick `+`:

```typescript
export function fmtPx(n: number): string {
  const whole = Math.floor(n);
  const frac32 = (n - whole) * 32;
  const i32 = Math.floor(frac32 + 1e-9);
  const halfTick = Math.round((frac32 - i32) * 4); // 0,1,2,3
  const sup = halfTick === 0 ? '' : (halfTick === 2 ? '+' : String(halfTick));
  return `${whole}-${String(i32).padStart(2, '0')}${sup}`;
}
```

Example: `98.140625` → `98-04+`.

---

## 4. Services

### 4.1 `MarketDataService`

`src/app/rates-ladder/market-data.service.ts` — emits `MarketData` via `BehaviorSubject<MarketData>`.

```typescript
@Injectable({ providedIn: 'root' })
export class MarketDataService {
  private readonly seed: MarketData = { /* PAYLOAD literal — see §4.3 */ };
  private readonly _data$ = new BehaviorSubject<MarketData>(this.seed);
  readonly data$ = this._data$.asObservable();

  // emits ('flash-up' | 'flash-down', priceKey) when a level qty changes
  readonly flash$ = new Subject<{ key: string; dir: 'up' | 'down' }>();

  startTickSimulation(intervalMs = 1100): Subscription { /* see §4.4 */ }
  stopTickSimulation(): void { /* clearInterval */ }

  // For real wiring later: replace seed/sim with WebSocket subscription
  connect(wsUrl: string, topic: string, marketId: number): void { /* §7 */ }
}
```

### 4.2 `VapService`

```typescript
@Injectable({ providedIn: 'root' })
export class VapService {
  private readonly _vapMap$ = new BehaviorSubject<Map<string, VapEntry>>(new Map());
  readonly vapMap$ = this._vapMap$.asObservable();

  /** Apply a single AMPS clobVAP print, accumulating into per-price entry. */
  applyPrint(p: VapPrint): void {
    const key = p.TradePrice.toFixed(8);
    const m = new Map(this._vapMap$.value);
    const cur = m.get(key) ?? { total: 0, buy: 0, sell: 0, other: 0, time: '' };
    m.set(key, {
      total: cur.total + p.TradeSize,
      buy:   cur.buy   + p.MarketBidVolume,
      sell:  cur.sell  + p.MarketAskVol,
      other: cur.other + p.MarketOtherVolume,
      time:  this.formatWallClock(p.TradeTime),
    });
    this._vapMap$.next(m);
  }

  /** Seed plausible distribution centered on lastPrice (for dev/demo). */
  seedSynthetic(lastPrice: number, tick: number): void { /* see §4.5 */ }

  private formatWallClock(epochMs: number): string {
    const d = new Date(epochMs);
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    return `${(((h + 11) % 12) + 1)}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
  }
}
```

### 4.3 Seed payload

Use this exact literal in `MarketDataService` for v1 (matches the design reference):

```typescript
{
  Id: 61711541, MarketId: 35, UnderlyingMarketId: 35,
  DV01: 779.6588375724411,
  Time: 1778261401498,
  LastTradePrice: 98.125, LastTradeSize: 1, LastTradeSource: 17,
  LastTradeTime: 1778261401276, LastTradeSide: 'BUY',
  HighTradePrice: 98.265625, LowTradePrice: 97.890625,
  RefPrice: 98.1318359375,
  RevisionId: 52244773, RevisionTime: 0,
  BidSubTickQuantity: 0, AskSubTickQuantity: 0,
  BidPricesUsed: 3, BidYield: 0.04362150857266394,
  Bid: [
    { Price: 98.125,    Qty: 18,  Source: [17, 42], Status: 0 },
    { Price: 98.109375, Qty: 337, Source: [42],     Status: 0 },
    { Price: 98.09375,  Qty: 87,  Source: [],       Status: 0 },
  ],
  AskPricesUsed: 2, AskYield: 0.04360146964130807,
  Ask: [
    { Price: 98.140625, Qty: 313, Source: [42, 17], Status: 0 },
    { Price: 98.15625,  Qty: 245, Source: [42],     Status: 0 },
  ],
  ProductGroup: 10,
}
```

### 4.4 Tick-simulation logic (port verbatim from `Ladder.jsx`)

Every `intervalMs`:
1. **60% chance**: pick a random level on bid or ask, mutate its `Qty` by ±(1..20), emit a `flash$` event with `{key, dir}` so the row pulses for 600ms.
2. **18% chance**: print a new last-trade at best bid or best ask. Update `LastTradePrice/Size/Side/Time`, push the price onto the sparkline buffer, and call `vapService.applyPrint(...)` with a synthetic `VapPrint` derived from the trade.
3. Always: `RevisionId++`, `Time = Date.now()`.

### 4.5 Synthetic VAP seed

For each price in `[centerPx - 12*tick, centerPx + 12*tick]`, generate `total` ≈ `900 * exp(-|i|*0.18) + rand*400`, split ~42/58 into buy/sell with a tiny "other" sliver. This populates the VAP column on initial render so the ladder doesn't look empty before any prints arrive. Use a deterministic PRNG (seeded sin) so reloads are stable.

---

## 5. The `<rates-ladder>` Component

### 5.1 Inputs / Outputs

```typescript
@Component({
  selector: 'rates-ladder',
  // standalone: true is the default in Angular 21 — omit the flag.
  imports: [/* sub-components only — no CommonModule needed with @if/@for */],
  templateUrl: './rates-ladder.component.html',
  styleUrl: './rates-ladder.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RatesLadderComponent {
  @Input() variant: LadderVariant = 'standard';
  @Input() title = 'MD Trader';
  @Input() width = 360;
  @Input() height = 720;
  @Input() ticking = true;
  @Input() theme: 'dark' | 'light' = 'dark';
  @Input() showVAP = false;
  @Input() tickSize = 1/64;
  @Input() instrumentLabel = 'TY · UST 10Y FUT · DEC26';

  @Output() submitOrder = new EventEmitter<{ side: 'BUY'|'SELL'; price: number; qty: number }>();
  @Output() cancelOrder = new EventEmitter<number>(); // index

  // signals
  data    = toSignal(this.mds.data$,    { requireSync: true });
  vapMap  = toSignal(this.vap.vapMap$,  { initialValue: new Map() });
  flashes = signal<Map<string, 'up'|'down'>>(new Map());
  orders  = signal<WorkingOrder[]>([
    { side: 'BUY',  price: 98.109375, qty: 25, status: 'working' },
    { side: 'SELL', price: 98.171875, qty: 10, status: 'working' },
  ]);
  size    = signal(10);
  sparkPts = signal<number[]>([/* seed 60-point intraday */]);

  rows = computed(() => buildRows(this.data(), { topPad: 9, botPad: 9, tick: this.tickSize }));
}
```

> Angular 21 alternative using the signal-input API (preferred for new components):
>
> ```typescript
> variant   = input<LadderVariant>('standard');
> width     = input(360);
> showVAP   = input(false);
> tickSize  = input(1/64);
> submitOrder = output<{ side: 'BUY'|'SELL'; price: number; qty: number }>();
> ```

### 5.2 Row builder

Port `buildRows()` from `Ladder.jsx` (search for `function buildRows`). It walks from `bestAsk + topPad*tick` down to `bestBid - botPad*tick` in `tick` steps, joining each price against the bid/ask maps and flagging `isLast/isHigh/isLow/isRefBand/isBestBid/isBestAsk`. Use `Math.round(x / tick) * tick` for floating-point safety when generating prices.

### 5.3 Layout grid

Each row is a CSS Grid with the columns below. Column widths come from `--col-template` set on the row container.

| Variant      | Grid template                                                      | VAP off width | VAP on width |
| ------------ | ------------------------------------------------------------------ | ------------- | ------------ |
| `standard`   | `1fr 86px 1fr` (+ `48px 90px 72px` if `showVAP`)                   | 360           | 580          |
| `pro`        | `30px 1fr 86px 1fr 30px` (+ `48px 90px 72px` if `showVAP`)         | 420           | 640          |
| `analytics`  | same as `standard`, plus a 156px right rail outside the body       | 520           | 740          |

### 5.4 Cell rules (replicate exactly)

- **Bid qty cell**: right-aligned, mono 11px, `var(--bid)` text. Bg `var(--bid-bg)` if `isBestBid`. Behind the text, render a `<depth-bar side="bid">` filling right-to-left, width = `qty / maxQty * 100%`, color `var(--bid)` at `0.18` opacity.
- **Ask qty cell**: mirror image of bid, left-aligned, fill left-to-right.
- **Price cell**: center column. Text `var(--bid)` if `isBestBid`, `var(--ask)` if `isBestAsk`, `var(--fg-1)` otherwise. If `isLast`, bg `rgba(245,193,58,0.10)`, font-weight 600, plus an arrow glyph (↑ if `LastTradeSide === 'BUY'`, ↓ otherwise) in `var(--yellow-300)`. Left gutter shows a 1-char marker — `H`/`L`/`R`/`•` — for high/low/ref-band/last respectively.
- **VAP total cell**: right-aligned, `var(--fg-1)`.
- **B/S Vol cell**: center, three numbers separated by thin `|` glyphs in `var(--fg-3)`. Buy in `var(--bid)`, other in `var(--fg-2)`, sell in `var(--ask)`. Font 10px.
- **VAP Time cell**: center, `var(--fg-3)`, font 10px.
- **Working-order chip**: 9px badge anchored top-left (bid side) or top-right (ask side) of the qty cell, bg `var(--brand)`, color `var(--on-brand)`, content = `qty`.
- **Pro click strips**: 30px-wide outer columns with a single faint `+` glyph; bg matches `--bid-bg`/`--ask-bg` on best levels; opacity 0.55 → 1 on hover. Click emits `submitOrder`.

### 5.5 Sparkline

Inline SVG, viewBox sized to props, stroke = `var(--mkt-up)` if last > first, else `var(--mkt-down)`, `stroke-width: 1`, `vector-effect: non-scaling-stroke`. Path is a simple `M … L …` over normalized points.

### 5.6 Header strip (KPI bar)

Top-to-bottom:
- Instrument label + market id (small).
- Big last-trade price `fmtPx(LastTradePrice)` + change vs. ref in 32nds + bps yield change.
- Tiny chips: `H 98-08+`, `L 97-28+`, `R 98-04+`, `DV01 $779.66`.
- Right side: 84×22 sparkline (omitted in `analytics` variant — that one uses the rail instead).

### 5.7 Footer

- Size pills: `[1] [5] [10] [25] [100]` + freeform `<input type="number">`. Active pill uses `var(--brand-soft)` bg + `var(--brand)` border/text.
- Action row: `Buy <bestAskPx>` (full width, `bid` color), `CXL` (icon button, narrow), `Sell <bestBidPx>` (full width, `ask` color).

### 5.8 Status strip (bottom)

22px tall, mono 10px, `var(--fg-3)`.
Left: `● AMPS` (green dot if connected). Middle: `rev <RevisionId>`. Right: `<HH:MM:SS.mmm UTC>` from `data().Time`.

---

## 6. Demo Shell (`AppComponent`)

Render the three variants horizontally so you can compare.

```html
<!-- app.component.html -->
<header class="demo-header">
  <h1>Rates Market Data Ladder</h1>
  <label><input type="checkbox" [(ngModel)]="ticking"> Live ticking</label>
  <label><input type="checkbox" [(ngModel)]="showVAP"> Show VAP columns</label>
  <label>
    Theme:
    <select [(ngModel)]="theme">
      <option value="dark">Dark</option>
      <option value="light">Light</option>
    </select>
  </label>
</header>

<main class="demo-grid">
  <rates-ladder variant="standard"  title="MD Trader · Standard"
    [width]="showVAP ? 580 : 360" [height]="720"
    [ticking]="ticking" [theme]="theme" [showVAP]="showVAP" />

  <rates-ladder variant="pro"       title="MD Trader · Pro"
    [width]="showVAP ? 640 : 420" [height]="720"
    [ticking]="ticking" [theme]="theme" [showVAP]="showVAP" />

  <rates-ladder variant="analytics" title="MD Trader · Analytics"
    [width]="showVAP ? 740 : 520" [height]="720"
    [ticking]="ticking" [theme]="theme" [showVAP]="showVAP" />
</main>
```

Background: `var(--bg-app)`. Demo grid: `display: flex; gap: 24px; padding: 24px; align-items: flex-start;`.

---

## 7. (Optional) Real AMPS WebSocket Wiring

Replace `MarketDataService.startTickSimulation()` with a WebSocket subscription:

```typescript
connect(wsUrl: string, marketId: number): void {
  this.ws = new WebSocket(wsUrl);
  this.ws.onopen = () => {
    // SOW + subscribe in one shot — typical AMPS pattern
    this.ws.send(JSON.stringify({
      c: 'sow_and_subscribe',
      t: 'rubiconCLOBProd/clobL2',
      query_id: `ladder-${marketId}`,
      filter: `/MarketId = ${marketId}`,
      bs: 100,
    }));
    this.ws.send(JSON.stringify({
      c: 'sow_and_subscribe',
      t: 'rubiconCLOBProd/clobVAP',
      query_id: `vap-${marketId}`,
      filter: `/MarketId = ${marketId}`,
      bs: 100,
    }));
  };
  this.ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.t === 'rubiconCLOBProd/clobL2')   this._data$.next(msg.data as MarketData);
    if (msg.t === 'rubiconCLOBProd/clobVAP')  this.vap.applyPrint(msg.data as VapPrint);
  };
}
```

Provide `wsUrl` via `environment.ts` (`environments/environment.ts` + `.prod.ts`).

---

## 8. Acceptance Criteria

The Angular port is "done" when:

- [ ] `ng serve` boots cleanly with no console errors.
- [ ] Three `<rates-ladder>` instances render side-by-side at the documented widths.
- [ ] Prices render in 32nds notation matching `fmtPx()` (test cases: `98.125 → 98-04`, `98.140625 → 98-04+`, `98.109375 → 98-03+`).
- [ ] Best bid row has green tint, best ask row has red tint, last-trade row has yellow tint.
- [ ] Depth bars fill proportionally to `qty / maxQty`, on the correct side.
- [ ] H/L/R/• gutter markers appear on the right rows.
- [ ] When `ticking=true`, qtys flash green/red briefly on change, and a new last-trade redraws every few seconds.
- [ ] When `showVAP=true`, three extra columns appear (VAP, B/S Vol, VAP Time), the ladder widens, and entries update when synthetic prints arrive.
- [ ] Theme toggle swaps dark ↔ light correctly across all three variants.
- [ ] `pro` variant shows BUY/SELL click strips on the outer columns and the working-orders strip below.
- [ ] `analytics` variant shows the 156px right rail with sparkline + KPI tiles (DV01, BidYield, AskYield in bps, Ref, MktId, Rev, Prices, Group).

---

## 9. Reference Files

In `design_reference/`:

| File                       | What it is                                                               |
| -------------------------- | ------------------------------------------------------------------------ |
| `Market Data Ladder.html`  | Demo shell (mounts the 3 variants on a design canvas + tweaks panel).    |
| `Ladder.jsx`               | **Primary source of truth.** Port this React/JSX file to Angular line-by-line. Contains `PAYLOAD`, `fmtPx`, `buildRows`, `LadderBody`, `Footer`, `AnalyticsRail`, `WorkingStrip`, `Ladder`, `buildVapMap`, tick simulator. |
| `chrome.jsx`, `chrome.css` | Shared chrome (Icon component, button classes). Use for icon names — Lucide. |
| `colors_and_type.css`      | Original CSS-variable palette. Mirror into `_tokens.scss`.               |
| `tweaks-panel.jsx`         | Original tweaks panel — purely demo, **do not port**. Replace with simple HTML controls in `AppComponent` (already in §6). |
| `design-canvas.jsx`        | Demo canvas wrapper — **do not port**. The 3 ladders just sit in a flexbox in `AppComponent`. |
| `current-ladder.jpeg`      | Photo of the current TT-style ladder showing column layout (Bids, Bid S, Price, Ask S, Asks, VAP, B/S Vol, VAP Time). Match this. |
| `vap-payload.jpeg`         | Photo of the raw clobVAP AMPS message. Authoritative for `VapPrint` shape. |

---

## 10. Notes & Gotchas

- **Floating-point prices**: never compare with `===`. Always key by `price.toFixed(8)`.
- **Tabular numerals**: without `font-variant-numeric: tabular-nums`, the price column will jitter as digits change. Apply globally to `.num` and `.font-mono` classes.
- **Change detection**: the project is **zoneless** by default in Angular 21 (`provideZonelessChangeDetection()` in `app.config.ts`). Drive all reactivity through signals (`signal`, `computed`, `toSignal`) — do not rely on zone.js to pick up mutations. Always emit a *new* top-level reference when updating `MarketData`; never mutate `Bid[]`/`Ask[]` arrays in place.
- **Templates**: use new control flow only — `@if (cond) { ... }`, `@for (row of rows(); track row.price) { ... }`, `@switch`. Do not write `*ngIf` / `*ngFor` / `ngClass` directives. For class binding use `[class.foo]="expr"` or `[class]="{ foo: expr }"`.
- **Inputs/outputs**: prefer the function-style `input()` / `output()` / `model()` signal APIs over the legacy `@Input()` / `@Output()` decorators in new code (the §5.1 sketch uses decorators for readability — either is fine, just be consistent).
- **Don't recreate VAP from scratch on every render** — accumulate into a `Map<string, VapEntry>` in `VapService` and pass via signal.
- **The pro variant's working-order chips** are rendered inside the bid/ask qty cells, anchored absolutely. Don't add them as new grid columns.
- **Yields** in the payload are decimal (0.0436); display as bps with 2 decimals (`0.0436 → "436.22 bps"`). Helper: `fmtBp(n) = (n * 10000).toFixed(2)`.
- **Instrument label is a placeholder** in the seed payload — real product would resolve `MarketId → symbol` via a lookup service. Stub it for v1.
- The reference uses the "Macro" yellow accent (`#f0b429`); keep this as the only accent color — bid/ask green/red are the only other semantic colors.

---

## 11. Suggested Claude Code Prompt

Paste this into your terminal session:

> I'm porting an HTML/React design reference to Angular. Read `design_handoff_rates_ladder/README.md` end-to-end before writing any code, then read every file in `design_handoff_rates_ladder/design_reference/` — especially `Ladder.jsx`, which is the source of truth. Scaffold a new Angular 17 standalone project per §1, implement the design tokens per §2, build the types per §3, the services per §4, the `<rates-ladder>` standalone component and its sub-components per §5, and the demo shell per §6. Use signals + OnPush change detection. Match every color, font size, and spacing value documented. When you're done, verify against the acceptance criteria in §8.
