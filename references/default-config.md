# Default Trading Configuration

## Chain & Tokens (Ethereum Mainnet)

| Parameter | Value |
|-----------|-------|
| chainId | 1 |
| fromTokenAddress | 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48 |
| toTokenAddress | 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2 |
| amount (wei) | 1000000000 (1000 USDC) |
| maxPriceImpact | 0.3% |

## Slippage Levels (try in order)

1. `0.001` — 0.1% (tightest)
2. `0.003` — 0.3%
3. `0.005` — 0.5% (fallback)

## Gas Safety Threshold

Abort if `estimateGasFee > expectedProfit * 2`
