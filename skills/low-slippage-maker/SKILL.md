---
name: low-slippage-maker
description: "Maker-entry volume trading strategy that minimizes slippage via conditional order simulation and time-phased exit management | 低滑点maker策略：模拟限价单入场、四阶段分时退出、链上低冲击交易执行算法"
version: "1.2.0"
author: "btca"
tags:
  - slippage
  - maker
  - trading
  - evm
  - solana
  - strategy
  - limit-order-simulation
  - 低滑点
  - maker策略
  - 模拟限价单
  - 分段止盈
  - 分阶段退出
  - 扫链交易
  - 链上做市
  - 低滑移
  - 挂单策略
  - 扫链
  - maker挂单
  - 做市
  - 4阶段
  - maker entry
  - 保本
---

# Low-Slippage Maker Strategy

## Overview

This skill enables automated 4-phase maker-entry trading on EVM chains and Solana. It simulates limit buy orders by polling on-chain price until the entry target is hit, then executes a time-phased exit sequence (fishing → breakeven → forced exit). The Agent selects coins from hot-tokens data; all trading logic runs autonomously in the bundled `scripts/scan.js` and `scripts/trade.js`.

**Strategy philosophy**: Instead of eating taker fees on every swap, we wait for price to dip 0.1% below market (maker-style entry). This saves ~0.05-0.1% on entry compared to immediate market buy. On exit, we prioritize fast profit capture (Phase 1 fishing at +1.8%), degrade to breakeven if no fill, and force-exit after 15 minutes to keep capital rotating. The core edge is reducing per-trade cost via patient entry. On Phase 3 (forced exit), trades are split into N chunks at 30-second intervals to prevent large single-sell orders from causing slippage spikes.

> **RISK DISCLAIMER**: This plugin executes real on-chain transactions automatically. Never trade with funds you cannot afford to lose. Always validate with `--dry-run true` first.

## Pre-flight Checks

Before using this skill, ensure:

1. Install onchainos CLI:
   ```bash
   npx skills add okx/onchainos-skills
   export PATH="$HOME/.local/bin:$PATH"
   ```
2. Verify Node.js >= 18: `node --version`
3. Verify onchainos is available: `onchainos --version`
4. Confirm wallet is authenticated: `onchainos wallet status`
5. Confirm sufficient balance: `onchainos wallet balance --chain <chain>`

## Commands

### Step 1 — Scan for tradeable tokens

```bash
node scripts/scan.js --chains <chain1,chain2> [--competition] [--quote <addr>] [--min-volume <usd>] [--min-liquidity <usd>] [--min-holders <n>] [--rank-by <1-10>]
```

**When to use**: At session start to identify top candidates. Run before every trading session.

**Output**: JSON array of top 5 tokens ranked by composite score. Each entry contains `rank`, `chain`, `symbol`, `address`, `priceImpact`, `change24h`, `volume24h`, `liquidity`, `holders`, `uniqueTraders`, `eligible`, `score`.

**Example (standard)**:
```bash
node scripts/scan.js --chains solana,xlayer --min-volume 500000 --min-liquidity 100000
```

**Example (competition mode — filters out stablecoins, wrapped natives, mainnet coins)**:
```bash
node scripts/scan.js --chains solana,xlayer --competition --min-volume 20000 --min-liquidity 20000
```

**`--competition` flag**: When enabled, automatically excludes tokens that don't qualify for trading competitions:
- Stablecoins: USDC, USDT, DAI, and derivatives
- Wrapped native tokens: WSOL, WETH, WOKB, xSOL, xETH, xBTC
- Mainnet coins: SOL, ETH, OKB, BTC, TRX
- Names containing "Wrapped", "Staked", "bridged"

**`--quote <addr>`**: Explicit quote token address. If omitted, auto-selects per chain (USDC for Solana/Ethereum/Base/Arbitrum, USDT for X Layer).

**Data source**: `onchainos token hot-tokens` → `onchainos swap quote` with appropriate quote currency. Uses `--risk-filter true --stable-token-filter true`.

**Scoring criteria** (depth 40% + trend 25% + volume 20% + holders 10% + uniqueTraders 5%):
- **Depth** (40%): `priceImpactPercent < 0.5%` required; lower is better
- **Trend** (25%): 24h change between -1% and +5% scores highest
- **Volume** (20%): 24h volume > $500k preferred
- **Holders** (10%): more holders = safer token
- **Unique Traders** (5%): reflects genuine demand

### Step 2 — Execute trading cycle

```bash
node scripts/trade.js \
  --chain <chain> \
  --from <fromTokenAddress> \
  --to <toTokenAddress> \
  --amount <amountInWei> \
  [--entry-discount 0.001] \
  [--fish-target 0.018] \
  [--breakeven 0.005] \
  [--stop-loss 0.006] \
  [--poll-sec 15] \
  [--dry-run true]
```

**When to use**: After user confirms token selection and parameters from scan results.

**Output**: Structured phase logs prefixed with `[TIMESTAMP][PHASE-N]` + final `SUMMARY:` line.

**Example**:
```bash
node scripts/trade.js --chain solana \
  --from So11111111111111111111111111111111111111112 \
  --to EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
  --amount 100000000 --dry-run true
```

**Phase behavior** (all polling runs inside the script, no agent heartbeat needed):

| Phase | Max Duration | Exit Condition | Action |
|-------|-------------|---------------|--------|
| 0 — Maker entry | 5 min | price ≤ market × (1 − entryDiscount) | Buy at discount; timeout → market buy |
| 1 — Fishing | 5 min | price ≥ entry × (1 + fishTarget) | Sell at profit (+1.8%) |
| 1b — Stop (Phase 1) | 5 min | price ≤ entry × (1 − stopLoss) | Emergency stop-loss (−0.6%) |
| 2 — Breakeven | 5 min | price ≥ entry × (1 + breakeven) | Sell at breakeven (+0.5%) |
| 2b — Stop (Phase 2) | 5 min | price ≤ entry × (1 − stopLoss) | Emergency stop-loss (−0.6%) |
| 3 — Forced exit | 5 min | always | Market sell in N chunks, 30s apart |

**Parameter defaults** (v1.2.0):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--entry-discount` | `0.001` | Buy 0.1% below market price |
| `--fish-target` | `0.018` | Phase 1 sell target: entry +1.8% |
| `--breakeven` | `0.005` | Phase 2 sell target: entry +0.5% |
| `--stop-loss` | `0.006` | Stop-loss: entry −0.6% |
| `--poll-sec` | `15` | Price polling interval in seconds |
| `--phase3-chunks` | `3` | Number of chunks to split Phase 3 exit into (1 = single sell) |

**PnL math** (approximate, assumes ~0.3% total swap fees):
- Best case: FISH_HIT → +1.8% − 0.3% fees = **+1.5% net profit**
- Breakeven: BREAKEVEN_HIT → +0.5% − 0.3% fees = **+0.2% net profit**
- Worst case: STOP_LOSS → −0.6% − 0.3% fees = **−0.9% net loss**
- Forced exit: market price − 0.3% fees = **variable**

## Examples

### Example 1: Complete Trading Session

**User**: "Scan Solana and X Layer for good tokens to trade."

**Agent**:
1. Run `node scripts/scan.js --chains solana,xlayer --min-volume 500000 --min-liquidity 100000`
2. Parse the JSON output and display a table:

   ```
   | Rank | Token   | Chain   | Price Impact | 24h Δ | Volume    | Score |
   |------|---------|---------|-------------|-------|-----------|-------|
   | 1    | TRUMP   | solana  | 0.03%       | +2.1% | $11.9M    | 87.3  |
   | 2    | RAY     | solana  | 0.08%       | −0.5% | $3.2M     | 82.1  |
   | 3    | WETH    | xlayer  | 0.12%       | +1.8% | $2.8M     | 76.4  |
   ```

3. **Ask user**: "Which token? What amount? Dry-run mode (default: true)?"
4. If user says "TRUMP, 100 USDC, dry-run false", repeat disclaimer and confirm.
5. Run `node scripts/trade.js --chain solana --from <USDC_ADDR> --to <TRUMP_ADDR> --amount 100000000 --dry-run false`
6. Wait for output, parse the `SUMMARY:` line:

   ```
   SUMMARY: result=FISH_HIT entryPrice=2.44 exitPrice=2.4839 grossPnl=1.80% netPnl=1.50%
   ```

7. Display: "✅ Trade completed: **FISH_HIT** | gross +1.80% → net +1.50% after fees."

### Example 2: Dry-Run Validation

**User**: "Test the strategy on WETH/USDC on Base with dry-run."

**Agent**:
```bash
node scripts/trade.js --chain base \
  --from 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 \
  --to 0x4200000000000000000000000000000000000006 \
  --amount 100000000 --dry-run true
```

**Expected output**: Phase logs with `[DRY-RUN]` markers instead of real tx hashes. No actual swaps executed.

### Example 3: Three consecutive STOP_LOSS — abort session

If three consecutive trades hit STOP_LOSS, the error handling table instructs to stop the session. The Agent should:
1. Report the sequence to the user.
2. Suggest reviewing market conditions before continuing.
3. Do NOT automatically start another cycle.

## Agent Workflow

Follow this exact sequence every session:

1. **Ask user** which chains to scan (default: `solana,xlayer`). User can select multiple.
2. **Run scan**: `node scripts/scan.js --chains <chains>`. Use the default filters unless user overrides.
3. **Display results** as a table showing: Rank, Token, Chain, Price Impact, 24h Δ, Volume, Score.
4. **Ask user to confirm**:
   - Which token (by rank or symbol)?
   - Trade amount in USD (convert to wei: $100 = 100000000 for 6-decimal tokens).
   - Dry-run on (default) or off?
5. **If switching to live trading** (`--dry-run false`): repeat the full risk disclaimer and require an explicit "yes, I understand the risks" confirmation.
6. **Execute**: run `node scripts/trade.js` with confirmed parameters. Stream stdout to user in real time.
7. **Parse result**: extract the `SUMMARY:` line using regex: `SUMMARY: result=(\w+) .* netPnl=([-\d.]+)%`
8. **Display formatted result**:
   ```
   ✅ Trade completed: {result} | gross +{grossPnl}% → net +{netPnl}%
   Entry: {entryPrice} → Exit: {exitPrice}
   ```
9. **Track consecutive STOP_LOSS count**. If 3 in a row, stop and warn user.

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| `ABORT: priceImpact > 0.5%` | Insufficient liquidity for trade size | Choose a different token from scan results; try smaller `--amount` |
| `Missing required args: --from --to --amount` | Incomplete parameters | Verify all three required params are provided |
| `onchainos: command not found` | CLI not installed or not in PATH | Run `export PATH="$HOME/.local/bin:$PATH"` and retry |
| `timeout` during scan | Token data unavailable or network slow | Token is skipped automatically; no action needed |
| 3 consecutive `STOP_LOSS` results | Adverse market conditions | **Stop session immediately**. Review market regime before next session. |
| `[SCAN]` stderr log | JSON parse failure or API error | Script logs the failed command; check onchainos API status |
| Script crash mid-trade | Process killed or network error | **High risk**: position may be open. Have user check `onchainos wallet balance` immediately. |

## Skill Routing

| User intent | Correct skill | Why |
|-------------|--------------|-----|
| One-time manual swap | `okx-dex-swap` | Single swap, no strategy needed |
| Check wallet balance | `okx-wallet-portfolio` | Portfolio view |
| Token security check | `okx-security` | Pre-trade safety scan |
| Smart money tracking | `okx-dex-signal` | Signal monitoring, not execution |
| Market price query | `okx-cex-market` or `okx-dex-market` | Price data only |
| **Automated maker strategy trading** | **This skill** | 4-phase entry/exit strategy |

**Do NOT use this skill for**: one-time swaps, price checks, portfolio queries, or any non-strategy trading.

## Security Notices

- **Risk level: ADVANCED** — autonomous on-chain execution over 15-minute cycles
- All swap commands include `--strategy-id low-slippage-maker` for attribution tracking
- Private keys are handled exclusively by onchainos CLI via TEE; never exposed to scripts
- `--dry-run true` is the default; live mode requires **double confirmation** (Agent warning + explicit user consent)
- No external API calls; all data sourced from onchainos CLI
- Maximum suggested trade size: 5% of wallet balance per cycle
- This strategy has a ~37.5% break-even win rate at current parameters; past performance does not guarantee future results
