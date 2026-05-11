# Strategy Default Configuration

## Token Pairs (reference — configured per-session via scan results)

| Chain | fromToken | toToken | Amount (6-decimal) |
|-------|-----------|---------|-------------------|
| Solana | SOL `So11111111111111111111111111111111111111112` | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 100 USDC = `100000000` |
| Ethereum | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | 100 USDC = `100000000` |
| Arbitrum | USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | WETH `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | 100 USDC = `100000000` |
| Base | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | WETH `0x4200000000000000000000000000000000000006` | 100 USDC = `100000000` |

## Strategy Parameters (trade.js defaults, v1.2.0)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--entry-discount` | `0.001` | Buy 0.1% below market price |
| `--fish-target` | `0.018` | Phase 1 sell target: entry +1.8% |
| `--breakeven` | `0.005` | Phase 2 sell target: entry +0.5% (covers ~0.3% fees + gas) |
| `--stop-loss` | `0.006` | Stop-loss: entry −0.6% |
| `--poll-sec` | `15` | Price polling interval in seconds |
| `--phase3-chunks` | `3` | Phase 3 exit split into N chunks, 30s apart |
| `--dry-run` | `true` | Simulate without executing swaps |

## Scan Parameters (scan.js defaults, v1.2.0)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--chains` | `solana,xlayer` | Comma-separated chain names (string: solana, ethereum, base, arbitrum, xlayer, bsc, polygon) |
| `--amount` | `100000000` | Trade size in minimal units for depth scoring (100 USDC = 100000000) |
| `--min-volume` | `500000` | Minimum 24h volume in USD |
| `--min-liquidity` | `100000` | Minimum liquidity in USD |
| `--min-holders` | `500` | Minimum token holder count |
| `--rank-by` | `7` | Sort dimension for hot-tokens (7=liquidity, 5=volume, 6=market cap) |

## Score Weights

| Indicator | Weight | Criteria |
|-----------|--------|---------|
| Depth (priceImpact) | 40% | Lower impact = higher score; >0.5% disqualifies |
| Trend (24h change) | 25% | −1% to +5% range scores highest |
| Volume (24h USD) | 20% | Higher volume = higher score; $500k baseline |
| Holders | 10% | More holders = safer; 500 baseline |
| Unique Traders | 5% | Active traders reflect genuine demand; 100 baseline |

## PnL Estimates (approximate, ~0.3% total swap fees assumed)

| Exit Result | Gross Δ | Net Δ (after fees) | Notes |
|-------------|---------|---------------------|-------|
| FISH_HIT | +1.8% | **+1.5%** | Best outcome |
| BREAKEVEN_HIT | +0.5% | **+0.2%** | Covers costs |
| STOP_LOSS | −0.6% | **−0.9%** | Worst outcome |
| FORCED_EXIT | variable | variable | Time-based exit |
