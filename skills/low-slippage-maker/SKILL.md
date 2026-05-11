---
name: low-slippage-maker
description: "Maker-entry volume trading strategy that minimizes slippage via conditional order simulation and time-phased exit management"
version: "1.0.0"
author: "btca"
tags:
  - slippage
  - maker
  - trading
  - evm
---

# Low-Slippage Maker Strategy

## Overview

Automated 4-phase maker-entry trading strategy for EVM chains. Minimizes slippage by simulating limit orders through price polling, then executing time-phased exits (fishing → breakeven → forced). Agent handles coin selection only; all trading logic runs autonomously in scripts.

> **RISK DISCLAIMER**: This plugin executes real on-chain transactions automatically. Never trade with funds you cannot afford to lose. Always validate with `--dry-run true` first.

## Pre-flight Checks

1. Install onchainos CLI:
   ```bash
   npx skills add okx/onchainos-skills
   export PATH="$HOME/.local/bin:$PATH"
   ```
2. Verify Node.js >= 18: `node --version`
3. Confirm wallet balance: `onchainos wallet balance --chain <chainId>`

## Commands

### Step 1 — Scan for tradeable tokens

```bash
node scripts/scan.js --chains <chainIds> [--amount <usd>]
```

**When to use**: At session start to identify top candidates.
**Output**: JSON array of top 3 tokens ranked by composite score (depth 50% + trend 30% + volume 20%).
**Example**:
```bash
node scripts/scan.js --chains 1,42161,8453 --amount 100
```

Scoring criteria:
- **Depth** (50%): `priceImpactPercentage < 0.5%` required; lower is better
- **Trend** (30%): 24h change between -1% and +5% scores highest (sideways/mild uptrend)
- **Volume** (20%): 24h volume > $500k preferred

### Step 2 — Execute trading cycle

```bash
node scripts/trade.js \
  --chain <chainId> \
  --from <fromTokenAddress> \
  --to <toTokenAddress> \
  --amount <amountInWei> \
  [--entry-discount 0.0007] \
  [--fish-target 0.004] \
  [--breakeven 0.0015] \
  [--stop-loss 0.005] \
  [--poll-sec 15] \
  [--dry-run true]
```

**When to use**: After user confirms token selection and parameters.
**Output**: Structured phase logs + final `SUMMARY:` line with PnL.
**Example**:
```bash
node scripts/trade.js --chain 1 \
  --from 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 \
  --to 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 \
  --amount 100000000 --dry-run true
```

**Phase behavior** (all polling runs inside the script, no agent heartbeat):

| Phase | Duration | Exit condition | Action |
|-------|----------|---------------|--------|
| 0 — Maker entry | ≤5 min | price ≤ market × (1 − entryDiscount) | Buy; timeout → market buy |
| 1 — Fishing | 0–5 min | price ≥ entry × (1 + fishTarget) | Sell at profit |
| 1 — Stop | 0–5 min | price ≤ entry × (1 − stopLoss) | Emergency sell |
| 2 — Breakeven | 5–10 min | price ≥ entry × (1 + breakeven) | Sell at breakeven |
| 3 — Forced exit | 10–15 min | always | Market sell, free capital |

## Agent Workflow

1. Ask user which chains to scan (can select multiple)
2. Run `node scripts/scan.js --chains <ids>`, display the Top 3 table
3. Ask user to confirm: which token, amount (in wei), dry-run on/off
4. If switching to live trading, repeat risk disclaimer and require explicit confirmation
5. Run `node scripts/trade.js <params>`, stream output to user
6. Parse the `SUMMARY:` line and display formatted PnL result

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `ABORT: priceImpact > 0.5%` | Insufficient liquidity | Choose a different token from scan results |
| `Missing required args` | Incomplete parameters | Verify --from --to --amount are provided |
| `onchainos: command not found` | CLI not installed | Run pre-flight step 1 |
| `timeout` in scan | Token data unavailable | Token skipped automatically; check chain ID |
| 3 consecutive STOP_LOSS | Adverse market | Stop session, review market conditions |

## Security Notices

- **Risk level: ADVANCED** — autonomous on-chain execution
- All swaps include `--strategy-id low-slippage-maker` for attribution
- Private keys handled exclusively by onchainos CLI via TEE; never exposed to scripts
- `--dry-run true` is the default; live mode requires explicit user confirmation
- No external API calls; all data sourced from onchainos CLI

## Skill Routing

- One-time manual swap → `okx-dex-swap`
- Portfolio overview → `okx-wallet-portfolio`
- Token security check → `okx-security`
