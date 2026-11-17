// spike trim: a long-biased cbBTC bot that trims spikes above its 4-hour EMA.
//
// It wants to be long CBBTC. It keeps an EMA of the 1-minute closes with a span of 240 bars
// (4 hours; alpha = 2 / 241, seeded with the first close). Until that EMA has seen 240 closes
// it simply holds: flat means buy. From then on it sells the whole position when the close
// runs more than 80 bps above the EMA (a spike worth trimming) and buys back with all its cash
// once the close is at or below the EMA again.
//
// Deterministic by construction: no clock, no environment, no randomness. The EMA is plain
// IEEE-754 arithmetic on the same closes in the same order, so both executions agree.

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch, OrderInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const SPAN = 240; // bars in the EMA: four hours of 1-minute closes
const ALPHA = 2 / (SPAN + 1); // the EMA's weight on the newest close
const TRIM_BPS = 80; // sell when the close is more than this far above the EMA
const MAX_SLIPPAGE_BPS = 300; // on every order

let ema = 0; // the EMA of the closes seen so far
let seen = 0; // how many closes the EMA has absorbed

/** Spend min(cash, weight room) on CBBTC; nothing when that is below the minimum notional. */
function buyAll(state: BarsState): OrderInput[] {
  const room = state.weightRoom(SYMBOL);
  const spend = state.cash < room ? state.cash : room;
  if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
  return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

/** Sell the whole held quantity. */
function sellAll(qty: bigint): OrderInput[] {
  return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
}

/** While long: is the close more than TRIM_BPS above the EMA, a spike worth trimming? */
function shouldTrim(close: number, ema: number): boolean {
  return close * 10_000 > ema * (10_000 + TRIM_BPS);
}

/** While flat: is the close back at or below the EMA, the moment to buy back in? */
function shouldRebuy(close: number, ema: number): boolean {
  return close <= ema;
}

function onBatch(state: BarsState, batch: Batch): OrderInput[] {
  const bar = batch.bars.find((b) => b.symbol === SYMBOL);
  if (bar === undefined) return []; // no CBBTC bar this minute: nothing to learn, nothing to do

  // Fold the close into the EMA (price_scale 5 keeps closes far inside the exact-integer range of a double).
  const close = Number(BigInt(bar.c));
  ema = seen === 0 ? close : ema + ALPHA * (close - ema);
  seen++;

  if (state.warmingUp) return []; // the harness's warm-up batches only feed the EMA

  const qty = state.positions.get(SYMBOL)?.qty ?? 0n;
  const long = qty > 0n;

  // Warm-up hold: until the EMA has seen SPAN closes it has nothing to say, so just be long.
  const emaWarmingUp = seen < SPAN;
  if (emaWarmingUp) return long ? [] : buyAll(state);

  // The trading rule proper: trim the spike when long, buy back at the EMA when flat.
  if (long) return shouldTrim(close, ema) ? sellAll(qty) : [];
  return shouldRebuy(close, ema) ? buyAll(state) : [];
}

await runBars({
  onBatch,
  onDone(state) {
    const start = BigInt(state.hello.capital.quote_units);
    console.error(`spike trim: done at seq ${state.seq}, net PnL ${state.cash - start} quote units`);
  },
});
