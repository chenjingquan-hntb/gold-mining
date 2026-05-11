# Strategy Default Configuration

## Token Pairs

| Chain | chainId | fromToken | toToken | Amount |
|-------|---------|-----------|---------|--------|
| Ethereum | 1 | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | WETH `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | 100 USDC = `100000000` wei |
| Arbitrum | 42161 | USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | WETH `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | 100 USDC = `100000000` wei |
| Base | 8453 | USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | WETH `0x4200000000000000000000000000000000000006` | 100 USDC = `100000000` wei |

## Strategy Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--entry-discount` | `0.0007` | Buy 0.07% below market price |
| `--fish-target` | `0.004` | Phase 1 sell target: entry +0.4% |
| `--breakeven` | `0.0015` | Phase 2 sell target: entry +0.15% (covers ~0.1% fees + gas) |
| `--stop-loss` | `0.005` | Stop-loss: entry -0.5% |
| `--poll-sec` | `15` | Price polling interval in seconds |
| `--dry-run` | `true` | Simulate without executing swaps |

## Scan Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `--chains` | `1` | Comma-separated EVM chain IDs |
| `--amount` | `100` | Trade size in USD for depth scoring |

## Score Weights

| Indicator | Weight | Criteria |
|-----------|--------|---------|
| Depth (priceImpact) | 50% | Lower impact = higher score; >0.5% disqualifies |
| Trend (24h change) | 30% | -1% to +5% range scores highest |
| Volume (24h USD) | 20% | Higher volume = higher score; $500k baseline |
