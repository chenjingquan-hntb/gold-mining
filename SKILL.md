---
name: gold-mining
description: Autonomous Web3 arbitrage agent using OKX OnchainOS — scans for low-slippage opportunities and executes trades automatically
license: MIT
metadata:
  author: chenjingquan-hntb
  version: "0.1"
  dependencies:
    - okx/onchainos-skills
---

# Gold Mining Skill

Autonomous arbitrage loop using OKX OnchainOS tools. Requires `okx/onchainos-skills` to be installed first.

## Usage

After installing, tell your agent:

> "Start gold mining on Ethereum: swap USDC → WETH, max price impact 0.3%, trade size 1000 USDC"

## Behavior

The agent will run this loop every 500ms:

### Step 1 — Scan (Market Monitor)

Use `get_swap_quote` from onchainos-skills with slippage=0.005 for the requested pair.

Abort this iteration if:
- `priceImpactPercentage` ≥ 0.3%
- `estimatedProfit` ≤ `estimateGasFee`

### Step 2 — Optimize (Slippage Optimizer)

If Step 1 passes, call `get_swap_quote` again with slippage = 0.001, then 0.003, then 0.005.
Use the first level where `priceImpactPercentage` < slippage value.
If none qualify, abort this iteration.

### Step 3 — Execute (Transaction Manager)

Call `execute_swap` with the optimal slippage from Step 2.
Poll `get_transaction_status` every 5s, up to 3 attempts.
Log: `[timestamp] txHash=0x... status=success|failed profit=N wei`

Stop the loop only if 3 consecutive transactions return `status=failed`.
