// Spike trim: a long-biased cbBTC bot for make.fun's btc-race-24h bounty (agent-fun/bars-replay/v1).
//
// It holds cbBTC most of the time, so it keeps a rising day's gain, but it sells the whole position when the
// price spikes more than TRIM_BPS above its EMA of the last EMA_BARS one-minute closes, and buys back once the
// price is back at or under that EMA. Short spikes on this pool tend to fade, so trimming them and re-entering
// lower pays more than the ~26 bps a round trip costs. Until the EMA has seen EMA_BARS closes it just holds.
//
// Deterministic: decisions read only the bars (never the clock, the environment or randomness), and the EMA is
// float64 arithmetic on the closes in order, so both graded runs send the same orders.

import { BPS, runBars, type BarsState, type Batch, type OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
/** 4 hours of 1-minute closes. */
const EMA_BARS = 240;
/** Sell when the close is 0.8% above the EMA. */
const TRIM_BPS = 80;
/** Refuse a fill more than 3% past the close it was decided on. */
const MAX_SLIPPAGE_BPS = 300;

let ema: number | null = null;
let seen = 0;

/** Fold one close into the EMA; returns the EMA after it. */
function updateEma(close: number): number {
  seen += 1;
  ema = ema === null ? close : ema + (2 / (EMA_BARS + 1)) * (close - ema);
  return ema;
}

/** One buy spending all the cash this reply may use, or nothing below the minimum notional. */
function buyAll(state: BarsState): OrderInput[] {
  const room = state.weightRoom(SYMBOL);
  const spend = state.cash < room ? state.cash : room;
  if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

/** One sell of the whole position. */
function sellAll(qty: bigint): OrderInput[] {
  return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

function decide(state: BarsState, batch: Batch): OrderInput[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return []; // no sample this minute: no new information
  const close = Number(bar.c);
  const level = updateEma(close);
  if (state.warmingUp) return [];
  const qty = state.positions.get(SYMBOL)?.qty ?? 0n;
  if (seen < EMA_BARS) return qty === 0n ? buyAll(state) : []; // warming the EMA: hold the default long
  if (qty > 0n) {
    return close * Number(BPS) > level * (Number(BPS) + TRIM_BPS) ? sellAll(qty) : [];
  }
  return close <= level ? buyAll(state) : [];
}

await runBars({ onBatch: decide });
