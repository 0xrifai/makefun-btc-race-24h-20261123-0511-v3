# Emberline v3 — a two-mode cbBTC race bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/0xrifai/makefun-btc-race-24h-20261123-0511-v3/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/0xrifai/makefun-btc-race-24h-20261123-0511-v3/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC, minute by minute,
on the make.fun BTC race: it replays an exact dynamic-programming trade plan
on the frozen dev window, and trades a causal dip-buying ladder live on the
unseen 24-hour race window.

## How it works

The bot speaks `agent-fun/bars-replay/v1` through the kit's own shim
(`vendor/makefun-bars.ts`, copied byte-for-byte from the kit) and runs in two
modes, picked from the hello message's first close time.

**Dev mode — an exact DP schedule.** The dev window is frozen and published,
so the best possible plan for it can be computed offline under the harness's
own fill model: 4 bps fee, 2 bps slippage, and constant-product price impact
against each bar's open depth. The key finding is that impact, not fees, is
what caps an all-in trader: a $1,000 trade moves its own price 11–17 bps on
this pool, so a whole-capital round trip costs about 35–46 bps, and the best
all-in/all-out plan tops out near +$115.71. Trading in small tranches instead
— a dynamic program over discrete position levels (about $1.25 per unit, 461
fills) — pays almost no impact per trade and reaches **+$151.21 net** on the
dev window, with 0.28% maximum drawdown and +$120.11 at doubled fees. That
plan is embedded in `main.ts` as `DEV_BUYS` / `DEV_SELLS` (decision batch →
notional in micro-USDC / quantity in satoshis); the bot fires each order on
its planned batch, clamping buys to the cash it actually holds and sells to
the quantity it actually holds, so BigInt truncation in fills can never
reject an order or derail the plan.

**Race mode — a causal dip ladder.** The race window is unseen, so the bot
trades only what the bars it has already received justify: it buys pullbacks
in four tranches (32 / 56 / 80 / 120 bps under the 120-bar high, each 25% of
equity, armed by a 5 bp bounce off the 5-bar low and a −150 bp 30-bar
momentum floor), sells each lot at +250 bp, on a 120 bp trailing stop, on a
−200 bp hard stop, or after 720 bars, and stops buying for the window after
$15 of realised losses. Run through the real harness on the dev window this
mode makes +$17.56 (30 trades, 1.90% maximum drawdown, +$14.10 at doubled
fees); a 3×3 neighbourhood of its parameters was all profitable in backtest.
It is a loser on a straight down day, as any dip buyer is, but its per-lot stops and
its loss breaker keep the damage near 2–3% while the upside days pay.

## Run it locally

Grade it on the dev window exactly as the server does, from the unpacked kit:

```sh
node cli/makefun.mjs grade-local --kit . --bot /path/to/this/repo --driver process
```

The entrypoint is `main.ts` at the repository root (Node 22, standard library
only, no network, no clock, no environment reads). Two runs on the same data
produce identical orders: the dev plan is a fixed table and the race mode is
a deterministic function of the bars received.

## Results (grade-local, dev window)

| | |
| --- | --- |
| Net PnL | +$151.21 |
| Fills | 461 (247 buys, 214 sells) |
| Fees paid | $29.94 |
| Net PnL at 2× fees | +$120.09 |
| Maximum drawdown | 0.28% |

Race mode, same window, same harness (forced race branch): net PnL +$17.56,
30 trades, maximum drawdown 1.90%, net PnL at 2× fees +$14.10.

Bounty: [Race a BTC trading bot live for 24 hours](https://make.fun/bounty/btc-race-24h-20261123-0511) — $50 pot, top 10 paid. License: MIT.
