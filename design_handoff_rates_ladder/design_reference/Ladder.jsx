// Market Data Ladder — Macro design system
// Data shape mirrors the AMPS market-data payload (Id, MarketId, Bid[], Ask[], …)

window.MacroLadder = (() => {
  const { useState, useEffect, useRef, useMemo } = React;
  const { Icon } = window.Chrome;

  // ── source payload (transcribed from the AMPS message) ────────────────
  const PAYLOAD = {
    Id: 61711541, MarketId: 35, UnderlyingMarketId: 35,
    DV01: 779.6588375724411,
    Time: 1778261401498,
    LastTradePrice: 98.125, LastTradeSize: 1.0, LastTradeSource: 17,
    LastTradeTime: 1778261401276, LastTradeSide: "BUY",
    HighTradePrice: 98.265625, LowTradePrice: 97.890625,
    RefPrice: 98.1318359375,
    RevisionId: 52244773, RevisionTime: 0,
    BidSubTickQuantity: 0.0, AskSubTickQuantity: 0.0,
    BidPricesUsed: 3, BidYield: 0.04362150857266394,
    Bid: [
      { Price: 98.125,    Qty: 18,  Source: [17,42], Status: 0 },
      { Price: 98.109375, Qty: 337, Source: [42],    Status: 0 },
      { Price: 98.09375,  Qty: 87,  Source: [],      Status: 0 },
    ],
    AskPricesUsed: 2, AskYield: 0.04360146964130807,
    Ask: [
      { Price: 98.140625, Qty: 313, Source: [42,17], Status: 0 },
      { Price: 98.15625,  Qty: 245, Source: [42],    Status: 0 },
    ],
    ProductGroup: 10,
  };

  const TICK = 1 / 64;            // 0.015625 — typical UST future tick
  const ROW_H = 22;
  const TENOR = "TY · UST 10Y FUT · DEC26";

  // synthetic working orders (user-side) so the ladder can show order chips
  const DEFAULT_ORDERS = [
    { side: "BUY",  price: 98.109375, qty: 25, status: "working" },
    { side: "SELL", price: 98.171875, qty: 10, status: "working" },
  ];

  // synthetic Volume-At-Price (clobVAP shape — TradePrice keyed)
  // Real msg: { Id, ECN, TradeTime, TradePrice, TradeSize, RecordId,
  //   MarketAskVol, MarketBidVolume, MarketOtherVolume, ProductGroup }
  // Aggregated client-side into per-price totals + last-trade time.
  function buildVapMap(centerPx) {
    // Generate plausible vol distribution centered on best-bid/ask
    const out = new Map();
    const seed = (Math.floor(centerPx * 64));
    const rand = (i) => {
      const x = Math.sin(seed * 9301 + i * 49297) * 233280;
      return x - Math.floor(x);
    };
    for (let i = -12; i <= 12; i++) {
      const p = +(centerPx + i * TICK).toFixed(8);
      const dist = Math.abs(i);
      const base = Math.round(900 * Math.exp(-dist * 0.18) + rand(i) * 400);
      const buy  = Math.round(base * (0.42 + rand(i + 100) * 0.16));
      const other = Math.round(rand(i + 200) * 8);
      const sell = Math.max(0, base - buy - other);
      // pseudo last-trade time spread across the day (ms-of-day → wall clock)
      const hour = 8 + Math.floor(rand(i + 300) * 8);
      const min  = Math.floor(rand(i + 400) * 60);
      const sec  = Math.floor(rand(i + 500) * 60);
      out.set(p.toFixed(8), {
        total: base, buy, sell, other,
        time: `${(((hour + 11) % 12) + 1)}:${String(min).padStart(2,"0")}:${String(sec).padStart(2,"0")} ${hour < 12 ? "AM" : "PM"}`,
      });
    }
    return out;
  }

  // ── helpers ──────────────────────────────────────────────────────────
  const fmtPx = (n) => {
    // 32nds notation: 98-04 (98 + 4/32) — typical for treasuries
    const whole = Math.floor(n);
    const frac32 = (n - whole) * 32;
    const i32 = Math.floor(frac32 + 1e-9);
    const halfTick = Math.round((frac32 - i32) * 4); // 0,1,2,3 quarters of 32nd
    const sup = halfTick === 0 ? "" : (halfTick === 2 ? "+" : String(halfTick));
    return `${whole}-${String(i32).padStart(2,"0")}${sup}`;
  };
  const fmtPxDec = (n) => n.toFixed(6).replace(/0+$/,"").replace(/\.$/,".0");
  const fmtQty = (n) => n == null ? "" : Number(n).toLocaleString();
  const fmtBp  = (n) => (n * 10000).toFixed(2);

  const clock = (t) => {
    const d = new Date(t);
    return d.toISOString().substr(11, 12); // hh:mm:ss.mmm
  };

  // Build a ladder of price rows around the action.
  // levels above mid = topPad, below = botPad.
  function buildRows(payload, { topPad = 9, botPad = 9 } = {}) {
    const bidMap = new Map(payload.Bid.map(b => [b.Price.toFixed(8), b]));
    const askMap = new Map(payload.Ask.map(a => [a.Price.toFixed(8), a]));
    const bestBid = payload.Bid[0]?.Price ?? payload.RefPrice;
    const bestAsk = payload.Ask[0]?.Price ?? payload.RefPrice;
    const bestAskIdx = topPad;                  // best ask sits at row topPad
    const totalRows = topPad + botPad + 2;      // +best ask & best bid
    const rows = [];
    for (let i = 0; i < totalRows; i++) {
      // descending prices top→bottom
      // i = bestAskIdx ⇒ bestAsk; below that, step down by TICK
      let price;
      if (i <= bestAskIdx) {
        price = bestAsk + (bestAskIdx - i) * TICK;
      } else {
        // gap-aware: jump from bestAsk → bestBid is 1 tick (since spread = 1 tick here)
        // generic: just step continuously by TICK
        price = bestAsk - (i - bestAskIdx) * TICK;
      }
      const k = price.toFixed(8);
      const bid = bidMap.get(k);
      const ask = askMap.get(k);
      rows.push({
        price,
        bidQty: bid?.Qty ?? null,
        askQty: ask?.Qty ?? null,
        sources: (bid?.Source || ask?.Source || []),
        isBestBid: !!bid && bid.Price === bestBid,
        isBestAsk: !!ask && ask.Price === bestAsk,
        isLast:   Math.abs(price - payload.LastTradePrice) < 1e-9,
        isHigh:   Math.abs(price - payload.HighTradePrice) < 1e-9,
        isLow:    Math.abs(price - payload.LowTradePrice)  < 1e-9,
        isRefBand:(payload.RefPrice >= price - TICK/2 && payload.RefPrice < price + TICK/2),
      });
    }
    const maxQty = Math.max(
      ...payload.Bid.map(b => b.Qty), ...payload.Ask.map(a => a.Qty)
    );
    return { rows, maxQty };
  }

  // ── small ui atoms ────────────────────────────────────────────────────
  const Sparkline = ({ pts = [], width = 120, height = 28, stroke = "var(--brand)" }) => {
    if (!pts.length) return null;
    const min = Math.min(...pts), max = Math.max(...pts);
    const range = max - min || 1;
    const dx = width / (pts.length - 1);
    const d = pts.map((p, i) => {
      const x = i * dx;
      const y = height - ((p - min) / range) * (height - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ");
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <path d={d} fill="none" stroke={stroke} strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  };

  // depth bar — proportional fill, anchored left or right
  const DepthBar = ({ qty, max, side }) => {
    if (qty == null) return null;
    const pct = Math.min(1, qty / max);
    const isBid = side === "bid";
    return (
      <div
        style={{
          position: "absolute",
          top: 0, bottom: 0,
          [isBid ? "right" : "left"]: 0,
          width: `${pct * 100}%`,
          background: isBid ? "var(--bid-bg)" : "var(--ask-bg)",
          pointerEvents: "none",
        }}
      />
    );
  };

  // arrow marker for high/low/ref/last
  const PriceMark = ({ kind }) => {
    const map = {
      high: { ch: "H", color: "var(--mkt-up)" },
      low:  { ch: "L", color: "var(--mkt-down)" },
      ref:  { ch: "R", color: "var(--brand)" },
      last: { ch: "•", color: "var(--yellow-300)" },
    };
    const { ch, color } = map[kind] || {};
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 12, height: 12, fontSize: 9, fontWeight: 700,
        color, fontFamily: "var(--font-mono)",
      }}>{ch}</span>
    );
  };

  // ── header strip ─────────────────────────────────────────────────────
  function HeaderStrip({ payload, sparkPts, dense = false }) {
    const change = payload.LastTradePrice - payload.RefPrice;
    const dir = change >= 0 ? "up" : "down";
    return (
      <div style={{
        padding: dense ? "8px 10px" : "10px 12px",
        borderBottom: "1px solid var(--border-1)",
        background: "var(--bg-panel)",
        display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="tag">FUT</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{TENOR}</span>
          </div>
          <span className="badge badge-live"><span className="dot"/>Live</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "nowrap", whiteSpace: "nowrap", overflow: "hidden" }}>
          <span className="num" style={{
            fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em",
            whiteSpace: "nowrap",
            color: dir === "up" ? "var(--mkt-up)" : "var(--mkt-down)",
          }}>
            {fmtPx(payload.LastTradePrice)}
          </span>
          <span className="num muted" style={{ fontSize: 11 }}>
            {payload.LastTradePrice.toFixed(5)}
          </span>
          <span className={"num " + dir} style={{ fontSize: 11 }}>
            {dir === "up" ? "▲" : "▼"} {Math.abs(change).toFixed(5)}
          </span>
          <span className={"num " + dir} style={{ fontSize: 11 }}>
            {(change >= 0 ? "+" : "−")}{Math.abs((change / payload.RefPrice) * 100).toFixed(3)}%
          </span>
          {sparkPts && (
            <div style={{ marginLeft: "auto" }}>
              <Sparkline pts={sparkPts} width={84} height={22}
                stroke={dir === "up" ? "var(--mkt-up)" : "var(--mkt-down)"} />
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "var(--fg-3)" }}>
          <span>HI <span className="num up">{fmtPx(payload.HighTradePrice)}</span></span>
          <span>LO <span className="num down">{fmtPx(payload.LowTradePrice)}</span></span>
          <span>REF <span className="num" style={{color:"var(--fg-2)"}}>{fmtPx(payload.RefPrice)}</span></span>
          <span style={{ marginLeft: "auto" }}>DV01 <span className="num" style={{color:"var(--fg-1)"}}>${payload.DV01.toFixed(2)}</span></span>
        </div>
      </div>
    );
  }

  // ── ladder rows (variant: "standard" | "pro" | "analytics") ──────────
  function LadderBody({ payload, orders, variant = "standard", flashMap, onClickPrice, onClickBid, onClickAsk, sizeStep, showVAP, vapMap }) {
    const { rows, maxQty } = useMemo(
      () => buildRows(payload, { topPad: variant === "pro" ? 8 : 9, botPad: variant === "pro" ? 8 : 9 }),
      [payload, variant]
    );

    // working order lookup
    const ordersByPrice = useMemo(() => {
      const m = new Map();
      orders.forEach(o => {
        const k = o.price.toFixed(8);
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(o);
      });
      return m;
    }, [orders]);

    // grid template per variant
    let cols;
    if (variant === "pro") {
      cols = "30px 1fr 86px 1fr 30px";
    } else {
      cols = "1fr 86px 1fr";
    }
    // append VAP columns: [VAP total] [B|O|S vol] [time]
    if (showVAP) {
      cols = cols + " 48px 90px 72px";
    }

    return (
      <div style={{
        background: "var(--bg-canvas)",
        flex: 1,
        display: "flex", flexDirection: "column", minHeight: 0,
      }}>
        {/* column headers */}
        <div className="label" style={{
          display: "grid", gridTemplateColumns: cols,
          padding: "0 6px", height: 22, alignItems: "center",
          borderBottom: "1px solid var(--border-1)",
          background: "var(--bg-panel)",
        }}>
          {variant === "pro" && <span style={{textAlign:"center"}}>B</span>}
          <span style={{ textAlign: "right", color: "var(--bid)" }}>BID QTY</span>
          <span style={{ textAlign: "center" }}>PRICE</span>
          <span style={{ textAlign: "left",  color: "var(--ask)" }}>ASK QTY</span>
          {variant === "pro" && <span style={{textAlign:"center"}}>S</span>}
          {showVAP && <span style={{ textAlign: "right", paddingRight: 4 }}>VAP</span>}
          {showVAP && <span style={{ textAlign: "center" }}>B/S VOL</span>}
          {showVAP && <span style={{ textAlign: "center" }}>VAP TIME</span>}
        </div>

        {/* rows */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {rows.map((r, idx) => {
            const k = r.price.toFixed(8);
            const ords = ordersByPrice.get(k) || [];
            const myBid = ords.find(o => o.side === "BUY");
            const myAsk = ords.find(o => o.side === "SELL");
            const flash = flashMap.get(k);

            // marker glyph for the price column gutter
            let mark = null;
            if (r.isLast) mark = "last";
            else if (r.isHigh) mark = "high";
            else if (r.isLow) mark = "low";
            else if (r.isRefBand) mark = "ref";

            return (
              <div
                key={idx}
                style={{
                  display: "grid", gridTemplateColumns: cols,
                  height: ROW_H, alignItems: "stretch",
                  borderBottom: "1px solid var(--border-grid)",
                  position: "relative",
                  background: r.isLast ? "rgba(245,193,58,0.06)" : "transparent",
                }}
                className={flash === "up" ? "flash-up" : flash === "down" ? "flash-down" : ""}
              >
                {/* PRO: BUY click strip */}
                {variant === "pro" && (
                  <div
                    onClick={() => onClickBid && onClickBid(r.price)}
                    style={{
                      borderRight: "1px solid var(--border-grid)",
                      cursor: "pointer",
                      background: r.isBestBid ? "var(--bid-bg)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)", fontSize: 9,
                      color: "var(--bid)", opacity: 0.55,
                    }}
                    title={`Buy ${sizeStep} @ ${fmtPx(r.price)}`}
                    onMouseEnter={(e)=>e.currentTarget.style.opacity=1}
                    onMouseLeave={(e)=>e.currentTarget.style.opacity=r.isBestBid?0.9:0.55}
                  >
                    +
                  </div>
                )}

                {/* BID QTY cell */}
                <div style={{
                  position: "relative",
                  borderRight: "1px solid var(--border-grid)",
                  background: r.isBestBid ? "var(--bid-bg)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "flex-end",
                  paddingRight: 8,
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: r.bidQty != null ? "var(--bid)" : "transparent",
                }}>
                  <DepthBar qty={r.bidQty} max={maxQty} side="bid" />
                  {myBid && (
                    <span style={{
                      position: "absolute", left: 4, top: 3,
                      fontSize: 9, padding: "1px 3px", borderRadius: 2,
                      background: "var(--brand)", color: "var(--on-brand)",
                      fontWeight: 600, lineHeight: 1, zIndex: 2,
                    }}>{myBid.qty}</span>
                  )}
                  <span style={{ position: "relative", zIndex: 1, fontWeight: r.isBestBid ? 600 : 400 }}>
                    {fmtQty(r.bidQty)}
                  </span>
                </div>

                {/* PRICE column */}
                <div
                  onClick={() => onClickPrice && onClickPrice(r.price)}
                  style={{
                    background: r.isLast ? "rgba(245,193,58,0.10)" : "var(--bg-canvas)",
                    borderLeft:  "1px solid var(--border-grid)",
                    borderRight: "1px solid var(--border-grid)",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 8px",
                    fontFamily: "var(--font-mono)",
                    fontSize: 11,
                    fontWeight: r.isLast ? 600 : 500,
                    color: r.isBestAsk ? "var(--ask)" : r.isBestBid ? "var(--bid)" : "var(--fg-1)",
                    cursor: "pointer",
                  }}
                >
                  <span style={{ width: 12 }}>{mark && <PriceMark kind={mark} />}</span>
                  <span>{fmtPx(r.price)}</span>
                  <span style={{ width: 12, textAlign: "right" }}>
                    {r.isLast && (
                      <span style={{ fontSize: 8, color: "var(--yellow-300)", fontWeight: 700 }}>
                        {payload.LastTradeSide === "BUY" ? "↑" : "↓"}
                      </span>
                    )}
                  </span>
                </div>

                {/* ASK QTY cell */}
                <div style={{
                  position: "relative",
                  borderLeft: "1px solid var(--border-grid)",
                  background: r.isBestAsk ? "var(--ask-bg)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "flex-start",
                  paddingLeft: 8,
                  fontFamily: "var(--font-mono)", fontSize: 11,
                  color: r.askQty != null ? "var(--ask)" : "transparent",
                }}>
                  <DepthBar qty={r.askQty} max={maxQty} side="ask" />
                  {myAsk && (
                    <span style={{
                      position: "absolute", right: 4, top: 3,
                      fontSize: 9, padding: "1px 3px", borderRadius: 2,
                      background: "var(--brand)", color: "var(--on-brand)",
                      fontWeight: 600, lineHeight: 1, zIndex: 2,
                    }}>{myAsk.qty}</span>
                  )}
                  <span style={{ position: "relative", zIndex: 1, fontWeight: r.isBestAsk ? 600 : 400 }}>
                    {fmtQty(r.askQty)}
                  </span>
                </div>

                {/* PRO: SELL click strip */}
                {variant === "pro" && (
                  <div
                    onClick={() => onClickAsk && onClickAsk(r.price)}
                    style={{
                      borderLeft: "1px solid var(--border-grid)",
                      cursor: "pointer",
                      background: r.isBestAsk ? "var(--ask-bg)" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)", fontSize: 9,
                      color: "var(--ask)", opacity: 0.55,
                    }}
                    title={`Sell ${sizeStep} @ ${fmtPx(r.price)}`}
                    onMouseEnter={(e)=>e.currentTarget.style.opacity=1}
                    onMouseLeave={(e)=>e.currentTarget.style.opacity=r.isBestAsk?0.9:0.55}
                  >
                    +
                  </div>
                )}

                {/* VAP columns (right rail) */}
                {showVAP && (() => {
                  const vap = vapMap?.get(r.price.toFixed(8));
                  const cell = {
                    borderLeft: "1px solid var(--border-grid)",
                    display: "flex", alignItems: "center",
                    fontFamily: "var(--font-mono)", fontSize: 11,
                  };
                  if (!vap) return (
                    <React.Fragment>
                      <div style={cell}></div>
                      <div style={cell}></div>
                      <div style={cell}></div>
                    </React.Fragment>
                  );
                  return (
                    <React.Fragment>
                      <div style={{ ...cell, justifyContent: "flex-end", paddingRight: 6, color: "var(--fg-1)" }}>
                        {fmtQty(vap.total)}
                      </div>
                      <div style={{ ...cell, justifyContent: "center", gap: 3, color: "var(--fg-2)", fontSize: 10 }}>
                        <span style={{ color: "var(--bid)", fontWeight: 500 }}>{vap.buy}</span>
                        <span style={{ color: "var(--fg-3)" }}>|</span>
                        <span style={{ color: "var(--fg-2)" }}>{vap.other}</span>
                        <span style={{ color: "var(--fg-3)" }}>|</span>
                        <span style={{ color: "var(--ask)", fontWeight: 500 }}>{vap.sell}</span>
                      </div>
                      <div style={{ ...cell, justifyContent: "center", color: "var(--fg-3)", fontSize: 10 }}>
                        {vap.time}
                      </div>
                    </React.Fragment>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── footer ───────────────────────────────────────────────────────────
  function Footer({ payload, size, setSize, variant }) {
    const sizes = [1, 5, 10, 25, 100];
    return (
      <div style={{
        borderTop: "1px solid var(--border-1)",
        background: "var(--bg-panel)",
        padding: 8, display: "flex", flexDirection: "column", gap: 6,
      }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span className="label" style={{ marginRight: 4 }}>SIZE</span>
          {sizes.map(s => (
            <button key={s}
              onClick={() => setSize(s)}
              className="btn btn-xs"
              style={{
                minWidth: 28, padding: "2px 6px",
                background: size === s ? "var(--brand-soft)" : "transparent",
                color: size === s ? "var(--brand)" : "var(--fg-2)",
                borderColor: size === s ? "var(--brand)" : "var(--border-2)",
                fontFamily: "var(--font-mono)",
              }}
            >{s}</button>
          ))}
          <input
            className="num"
            value={size}
            onChange={e => setSize(Number(e.target.value) || 0)}
            style={{ width: 56, marginLeft: 4, height: 22, fontSize: 11 }}
          />
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btn-bid" style={{ flex: 1, justifyContent: "center", padding: "6px 0", fontSize: 12 }}>
            Buy {fmtPx(payload.Ask[0]?.Price ?? payload.RefPrice)}
          </button>
          <button className="btn" style={{ padding: "6px 8px" }} title="Cancel all working orders">
            <Icon name="x" size={12} /> CXL
          </button>
          <button className="btn btn-ask" style={{ flex: 1, justifyContent: "center", padding: "6px 0", fontSize: 12 }}>
            Sell {fmtPx(payload.Bid[0]?.Price ?? payload.RefPrice)}
          </button>
        </div>
      </div>
    );
  }

  // ── analytics rail (KPI strip on the right) ──────────────────────────
  function AnalyticsRail({ payload, sparkPts }) {
    const items = [
      { label: "DV01",       v: "$" + payload.DV01.toFixed(2), kind: "neutral" },
      { label: "BID YIELD",  v: fmtBp(payload.BidYield) + " bps", kind: "bid" },
      { label: "ASK YIELD",  v: fmtBp(payload.AskYield) + " bps", kind: "ask" },
      { label: "REF",        v: fmtPx(payload.RefPrice), kind: "neutral" },
      { label: "MKT ID",     v: payload.MarketId,         kind: "muted" },
      { label: "REV",        v: payload.RevisionId,       kind: "muted" },
      { label: "PRICES",     v: `${payload.BidPricesUsed} × ${payload.AskPricesUsed}`, kind: "muted" },
      { label: "GROUP",      v: payload.ProductGroup,     kind: "muted" },
    ];
    const colorFor = (k) => k === "bid" ? "var(--bid)" : k === "ask" ? "var(--ask)" : k === "muted" ? "var(--fg-3)" : "var(--fg-1)";
    return (
      <div style={{
        width: 156, borderLeft: "1px solid var(--border-1)",
        background: "var(--bg-panel)",
        display: "flex", flexDirection: "column",
      }}>
        <div className="label" style={{ padding: "6px 10px", borderBottom: "1px solid var(--border-1)" }}>
          ANALYTICS
        </div>
        <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <div className="label">INTRADAY</div>
            <div style={{ marginTop: 4 }}>
              <Sparkline pts={sparkPts} width={132} height={36} />
            </div>
            <div style={{
              display: "flex", justifyContent: "space-between",
              fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)", marginTop: 2,
            }}>
              <span>{fmtPx(payload.LowTradePrice)}</span>
              <span>{fmtPx(payload.HighTradePrice)}</span>
            </div>
          </div>
          {items.map(it => (
            <div key={it.label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span className="label">{it.label}</span>
              <span className="num" style={{ fontSize: 12, color: colorFor(it.kind), fontWeight: 500 }}>{it.v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── working orders strip (pro variant) ───────────────────────────────
  function WorkingStrip({ orders, onCancel }) {
    if (!orders.length) {
      return (
        <div className="muted" style={{
          fontSize: 10, padding: "6px 10px",
          borderTop: "1px solid var(--border-1)",
          background: "var(--bg-canvas)",
        }}>
          No working orders. Click a price level to place one.
        </div>
      );
    }
    return (
      <div style={{
        borderTop: "1px solid var(--border-1)",
        background: "var(--bg-canvas)",
        padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4,
      }}>
        <div className="label">WORKING · {orders.length}</div>
        {orders.map((o, i) => (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "44px 1fr 1fr 20px",
            alignItems: "center", gap: 6,
            fontSize: 11, fontFamily: "var(--font-mono)",
            padding: "2px 4px", borderRadius: 3,
            background: "var(--bg-raised)",
            border: "1px solid var(--border-1)",
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: ".04em",
              color: o.side === "BUY" ? "var(--bid)" : "var(--ask)",
            }}>{o.side}</span>
            <span>{o.qty} @ {fmtPx(o.price)}</span>
            <span className="badge badge-working" style={{justifySelf:"start"}}>
              <span className="dot"/>working
            </span>
            <button
              className="btn btn-xs"
              style={{ padding: "1px 4px", justifyContent: "center" }}
              onClick={() => onCancel(i)}
              title="Cancel"
            >
              <Icon name="x" size={10}/>
            </button>
          </div>
        ))}
      </div>
    );
  }

  // ── main Ladder ──────────────────────────────────────────────────────
  function Ladder({ variant = "standard", title = "Ladder", width = 360, height = 720, ticking = true, theme = "dark", showVAP = false }) {
    const [payload, setPayload] = useState(PAYLOAD);
    const [orders, setOrders] = useState(DEFAULT_ORDERS);
    const [size, setSize] = useState(10);
    const [flashMap, setFlashMap] = useState(() => new Map());
    const [vapMap, setVapMap] = useState(() => buildVapMap(PAYLOAD.LastTradePrice));
    const [sparkPts, setSparkPts] = useState(() => {
      // generate plausible intraday path between low and high
      const n = 60, lo = PAYLOAD.LowTradePrice, hi = PAYLOAD.HighTradePrice;
      let p = (lo + hi) / 2;
      const out = [];
      for (let i = 0; i < n; i++) {
        p += (Math.random() - 0.5) * (hi - lo) * 0.07;
        p = Math.max(lo, Math.min(hi, p));
        out.push(p);
      }
      out[n - 1] = PAYLOAD.LastTradePrice;
      return out;
    });

    // simulated tick stream
    useEffect(() => {
      if (!ticking) return;
      const t = setInterval(() => {
        setPayload(p => {
          const next = { ...p, Bid: p.Bid.map(b => ({...b})), Ask: p.Ask.map(a => ({...a})) };
          // wiggle a quantity
          if (Math.random() < 0.6) {
            const side = Math.random() < 0.5 ? "Bid" : "Ask";
            const idx = Math.floor(Math.random() * next[side].length);
            const delta = (Math.random() < 0.5 ? -1 : 1) * Math.max(1, Math.round(Math.random() * 20));
            next[side][idx].Qty = Math.max(1, next[side][idx].Qty + delta);
            const k = next[side][idx].Price.toFixed(8);
            const dir = delta > 0 ? "up" : "down";
            setFlashMap(m => { const n = new Map(m); n.set(k, dir); return n; });
            setTimeout(() => setFlashMap(m => { const n = new Map(m); n.delete(k); return n; }), 600);
          }
          // occasional new last trade
          if (Math.random() < 0.18) {
            const useBid = Math.random() < 0.5;
            const lvl = useBid ? next.Bid[0] : next.Ask[0];
            next.LastTradePrice = lvl.Price;
            next.LastTradeSide = useBid ? "SELL" : "BUY";
            next.LastTradeSize = Math.max(1, Math.round(Math.random() * 5));
            next.LastTradeTime = Date.now();
            setSparkPts(s => [...s.slice(1), lvl.Price]);
            // bump VAP for the printed price
            const k = lvl.Price.toFixed(8);
            const side = next.LastTradeSide;
            setVapMap(m => {
              const n = new Map(m);
              const cur = n.get(k) || { total: 0, buy: 0, sell: 0, other: 0, time: "" };
              const sz = next.LastTradeSize;
              const d = new Date();
              const h = d.getHours(), mi = d.getMinutes(), s = d.getSeconds();
              n.set(k, {
                total: cur.total + sz,
                buy: cur.buy + (side === "BUY" ? sz : 0),
                sell: cur.sell + (side === "SELL" ? sz : 0),
                other: cur.other,
                time: `${(((h + 11) % 12) + 1)}:${String(mi).padStart(2,"0")}:${String(s).padStart(2,"0")} ${h < 12 ? "AM" : "PM"}`,
              });
              return n;
            });
          }
          next.RevisionId = p.RevisionId + 1;
          next.Time = Date.now();
          return next;
        });
      }, 1100);
      return () => clearInterval(t);
    }, [ticking]);

    const onClickBid = (price) => setOrders(o => [...o, { side: "BUY",  price, qty: size, status: "working" }]);
    const onClickAsk = (price) => setOrders(o => [...o, { side: "SELL", price, qty: size, status: "working" }]);
    const onCancel = (i) => setOrders(o => o.filter((_, j) => j !== i));

    return (
      <div className={theme === "light" ? "theme-light" : ""}
        style={{
          width, height,
          background: "var(--bg-app)",
          color: "var(--fg-1)",
          border: "1px solid var(--border-2)",
          borderRadius: 8,
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
        }}
      >
        {/* window chrome */}
        <div style={{
          height: 28, padding: "0 8px",
          background: "var(--bg-app)",
          borderBottom: "1px solid var(--border-1)",
          display: "flex", alignItems: "center", gap: 8,
          flex: "0 0 auto",
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 999,
            background: "var(--mkt-up)",
          }} />
          <span style={{ fontSize: 11, color: "var(--fg-2)", fontWeight: 500 }}>{title}</span>
          <span className="muted" style={{ fontSize: 10, fontFamily: "var(--font-mono)" }}>· {payload.MarketId}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
            <button className="btn btn-xs" title="Recenter">
              <Icon name="locate-fixed" size={10}/>
            </button>
            <button className="btn btn-xs" title="Settings">
              <Icon name="settings-2" size={10}/>
            </button>
          </div>
        </div>

        <HeaderStrip payload={payload}
          sparkPts={variant === "analytics" ? null : sparkPts}
          dense={variant === "pro"} />

        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <LadderBody
            payload={payload}
            orders={orders}
            variant={variant}
            flashMap={flashMap}
            sizeStep={size}
            showVAP={showVAP}
            vapMap={vapMap}
            onClickBid={onClickBid}
            onClickAsk={onClickAsk}
            onClickPrice={() => {}}
          />
          {variant === "analytics" && <AnalyticsRail payload={payload} sparkPts={sparkPts} />}
        </div>

        {variant === "pro" && <WorkingStrip orders={orders} onCancel={onCancel} />}
        <Footer payload={payload} size={size} setSize={setSize} variant={variant} />

        {/* status strip */}
        <div style={{
          height: 22, padding: "0 8px",
          background: "var(--bg-canvas)",
          borderTop: "1px solid var(--border-1)",
          display: "flex", alignItems: "center", gap: 10,
          fontSize: 10, color: "var(--fg-3)", fontFamily: "var(--font-mono)",
          flex: "0 0 auto",
        }}>
          <span style={{ color: "var(--mkt-up)" }}>● AMPS</span>
          <span>rev {payload.RevisionId}</span>
          <span style={{ marginLeft: "auto" }}>{clock(payload.Time)} UTC</span>
        </div>
      </div>
    );
  }

  return { Ladder, PAYLOAD };
})();
