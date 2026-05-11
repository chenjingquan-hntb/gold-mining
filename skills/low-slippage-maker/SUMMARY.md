## Overview

Low-Slippage Maker is an advanced automated trading strategy plugin for EVM chains and Solana that minimizes slippage by simulating maker-style limit orders through price polling and executing time-phased exits.

Core operations:

- Scan multiple chains in parallel and rank tokens by depth, trend, volume, holders, and unique traders (Top 3)
- Simulate limit buy orders by polling price until entry target is reached (0.1% below market)
- Execute time-phased exits: fishing target (+1.8%), breakeven (+0.5%), forced market exit
- Enforce stop-loss (−0.6%) at every phase to protect capital
- Dry-run simulation mode enabled by default for safe validation

Tags: `strategy` `slippage` `maker` `evm` `solana` `trading`

## Prerequisites

- No IP restrictions
- Supported chains: Solana, Ethereum, Arbitrum, Base, X Layer, BSC, Polygon, and any chain supported by onchainos CLI
- Supported tokens: Any token pair with price impact < 0.5% for the intended trade size
- onchainos CLI installed and wallet authenticated
- Node.js >= 18
- Sufficient wallet balance: recommended at least 5× trade amount for gas and cushion

## Quick Start

1. **Scan for candidates**: Tell the agent which chains to scan (e.g., "scan Solana and X Layer"). It runs `scripts/scan.js` using hot-tokens data with risk filtering and shows a ranked table of Top 3 tokens with depth, trend, volume, holders, and composite score.

2. **Review and confirm**: Pick a token from the list. The agent asks for trade amount (in USD, auto-converted to wei) and whether to use dry-run mode. Dry-run is on by default — confirm parameters before going live.

3. **Run dry-run first**: `scripts/trade.js` simulates all 4 phases using real price data but skips actual swaps. Review the phase logs and final `SUMMARY:` line to verify the strategy behaves as expected.

4. **Enable live trading**: Say "set dry-run false" to switch to live mode. The agent repeats the risk disclaimer twice and requires explicit confirmation before executing real transactions.

5. **Monitor and decide**: The script runs autonomously through all phases (max 15 minutes per cycle) and prints a `SUMMARY:` with result type, entry price, exit price, PnL, and PnL%. Based on results, start the next cycle or stop the session. Three consecutive STOP_LOSS results trigger an automatic session halt.
