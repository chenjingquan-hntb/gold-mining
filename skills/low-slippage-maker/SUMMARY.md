## Overview

Low-Slippage Maker is an advanced automated trading strategy plugin for EVM chains that minimizes slippage by simulating maker-style limit orders through price polling and executing time-phased exits.

Core operations:

- Scan multiple EVM chains in parallel and rank tokens by depth, trend, and volume (Top 3)
- Simulate limit buy orders by polling price until entry target is reached (0.05–0.1% below market)
- Execute time-phased exits: fishing target (+0.3–0.5%), breakeven (+0.15%), forced market exit
- Enforce stop-loss (-0.5%) and session MAX_AMOUNT caps on every cycle
- Dry-run simulation mode enabled by default for safe validation

Tags: `strategy` `slippage` `maker` `evm` `trading`

## Prerequisites

- No IP restrictions
- Supported chains: Any EVM chain supported by onchainos CLI (Ethereum, Arbitrum, Base, etc.)
- Supported tokens: Any ERC-20 token pair with price impact < 0.5% for the intended trade size
- onchainos CLI installed and wallet authenticated
- Node.js >= 18

## Quick Start

1. **Scan for candidates**: Tell the agent which chains to scan (e.g., "scan Ethereum and Arbitrum"). It runs `scan.js` and shows a ranked table of Top 3 tokens with depth, trend, and volume scores.

2. **Review and confirm**: Pick a token from the list. The agent asks for trade amount and whether to use dry-run mode. Dry-run is on by default — confirm parameters before going live.

3. **Run dry-run first**: The script simulates all 4 phases using real price data but skips actual swaps. Review the phase logs and final SUMMARY line to verify the strategy behaves as expected.

4. **Enable live trading**: Say "set dry-run false" to switch to live mode. The agent repeats the risk disclaimer and requires explicit confirmation before executing real transactions.

5. **Monitor and repeat**: The script runs autonomously through all phases and prints a SUMMARY with entry price, exit price, and PnL. Start the next cycle or stop the session based on results.
