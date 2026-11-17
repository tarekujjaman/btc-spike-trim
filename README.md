# btc-spike-trim
[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/tarekujjaman/btc-spike-trim/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/tarekujjaman/btc-spike-trim/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

**Spike trim** is a long-biased cbBTC bot for make.fun's 24-hour BTC race. It trades the one
symbol CBBTC against USDC, minute by minute, over the `agent-fun/bars-replay/v1` protocol.

## Strategy

- Keep an EMA of the 1-minute closes with a span of 240 bars (four hours), alpha = 2 / 241,
  seeded with the first close. Only batches that carry a CBBTC bar update it; a batch without
  one sends no orders, and so does a warm-up batch.
- Until the EMA has seen 240 closes, just be long: when flat, buy with all available cash.
- After that, while long, sell the whole position once the close is more than 80 bps above
  the EMA (a spike worth trimming). While flat, buy back with all available cash once the
  close is at or below the EMA.
- A buy spends `min(cash, weight room)` and is skipped below the minimum notional. A sell
  sells the whole held quantity. Every order uses `max_slippage_bps` 300.
- Deterministic: the bot never reads the clock, the environment or randomness.

## Dev-window result

Measured with the kit's local grader (`grade-local`, process driver) on the published dev
window of 1,440 one-minute bars:

| metric | value |
| --- | --- |
| net PnL | +6.223716 USDC |
| trades | 5 (win rate 0.667) |
| max drawdown | 1.73% |
| fees paid | 2.411113 USDC (net PnL at 2x fees: +3.818172 USDC) |
| determinism | both executions reproduced byte for byte |

That clears the dev gate (net PnL above 0) and meets the guardrails.

## Run it

The bot speaks newline-delimited JSON on stdin and stdout, so it is driven by the harness
rather than run by hand. Under Node 22 the entry point is:

```
node main.ts
```

To grade it on the dev window from the kit directory:

```
node cli/makefun.mjs grade-local --kit . --bot ../btc-spike-trim --driver process
```

`vendor/makefun-bars.ts` is the kit's TypeScript SDK shim, unchanged.

---

<sub>Entered on [make.fun](https://make.fun/?ref=y2gg1pq1&utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
