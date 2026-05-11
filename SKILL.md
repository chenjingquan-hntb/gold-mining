---
name: gold-mining
description: >-
  Autonomous Web3 arbitrage agent using OKX OnchainOS. Scans on-chain liquidity
  pools for low-slippage swap opportunities and executes trades automatically.
  Use when user says "start gold mining", "run arbitrage", "scan for swap opportunities",
  "execute defi trading", "start auto trading on chain", or "淘金".
argument-hint: [--chain <chainId>] [--from <tokenAddress>] [--to <tokenAddress>] [--amount <wei>] [--max-impact <percent>]
user-invocable: true
disable-model-invocation: false
allowed-tools: >-
  mcp__onchainos-skills__get_swap_quote,
  mcp__onchainos-skills__execute_swap,
  mcp__onchainos-skills__get_transaction_status,
  mcp__onchainos-skills__get_token_price,
  Bash(node scripts/calc_profit.js *)
model: sonnet
context: fork
metadata:
  author: chenjingquan-hntb
  version: "0.2"
  dependencies:
    - okx/onchainos-skills
  license: MIT
---

# Gold Mining — Web3 Arbitrage Agent

## 使用场景
链上低滑点套利，适用于：
- 用户说"开始淘金"或"start gold mining"
- 需要自动扫描并执行 DEX 套利机会
- 全自动无人值守交易循环

## 参数解析

从用户输入中提取参数，缺省使用 `references/default-config.md` 中的值：

| 参数 | 说明 |
|------|------|
| `--chain` | EVM chain ID，默认 1（Ethereum） |
| `--from` | 卖出 token 地址 |
| `--to` | 买入 token 地址 |
| `--amount` | 交易金额（wei） |
| `--max-impact` | 最大价格影响百分比，默认 0.3 |

## 执行流程

每轮循环执行以下步骤，循环间隔 500ms：

### Step 1 — 扫描机会（Market Monitor）

1. 调用 `get_swap_quote`，参数：`{chainId, fromTokenAddress, toTokenAddress, amount, slippage: "0.005"}`
2. 读取返回的 `priceImpactPercentage` 和 `estimateGasFee`
3. 运行 `node scripts/calc_profit.js <toAmount> <fromAmount> <gasFee>` 计算预期利润
4. **中止条件**（任一满足则跳过本轮）：
   - `priceImpactPercentage >= max-impact`
   - 脚本输出 `profit <= 0`

### Step 2 — 寻优滑点（Slippage Optimizer）

仅在 Step 1 通过后执行：

1. 依次用 slippage = `0.001` → `0.003` → `0.005` 调用 `get_swap_quote`
2. 选择第一个满足 `priceImpactPercentage < slippage` 且利润 > 0 的档位
3. 若三档均不满足，中止本轮并记录原因

### Step 3 — 执行交易（Transaction Manager）

1. 调用 `execute_swap`，传入 Step 2 的最优 slippage 和交易参数
2. 每 5 秒调用 `get_transaction_status` 轮询，最多 3 次
3. 记录日志：`[ISO时间] txHash=0x... status=success|failed profit=N wei slippage=X`

## 停止条件

连续 3 笔交易返回 `status=failed` 时停止循环，输出错误摘要。

## 约束

- 不修改任何本地文件，只执行链上操作
- 不在单轮循环内发送多笔相关交易
- 发现异常 gas（> 预期 5 倍）时中止本轮，不执行

## 参考资料

详细链上参数配置见 `references/default-config.md`
利润计算逻辑见 `scripts/calc_profit.js`
