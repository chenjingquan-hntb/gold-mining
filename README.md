# Gold Mining — OKX OnchainOS Trading Skills

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.2.0-blue)](https://github.com/chenjingquan-hntb/gold-mining)

链上自动交易策略集合，基于 [OKX OnchainOS](https://github.com/okx/plugin-store) 构建，通过 AI Agent 编排实现低滑点交易执行与刷量奖励优化。

---

## 可用技能

| Skill | 版本 | 说明 |
|-------|------|------|
| [`low-slippage-maker`](skills/low-slippage-maker/) | v1.2.0 | 低滑点 maker 策略：模拟限价单入场、四阶段分时退出、专为刷量奖励优化的链上执行算法 |

---

## 快速安装

```bash
npx skills add chenjingquan-hntb/gold-mining --skill low-slippage-maker
```

## 快速开始

```bash
# 1. 扫描 Solana 和 X Layer，找低滑点代币
node scripts/scan.js --chains solana,xlayer --min-volume 500000 --min-liquidity 100000

# 2. dry-run 验证交易策略
node scripts/trade.js \
  --chain solana \
  --from <USDC_ADDRESS> \
  --to <TOKEN_ADDRESS> \
  --amount 100000000 \
  --dry-run true

# 3. 实盘交易（需人工确认）
node scripts/trade.js \
  --chain solana \
  --from <USDC_ADDRESS> \
  --to <TOKEN_ADDRESS> \
  --amount 100000000 \
  --dry-run false
```

## 策略概览 — low-slippage-maker

4 阶段 maker 入场交易策略，核心目标是 **降低大交易量时的滑点损失**：

```
Phase 0（入场） → 等价格回落 0.1% 买入，超时 5min 市价追入
Phase 1（止盈） → 价格上涨 1.8% 卖出，触发止损 -0.6% 紧急退出
Phase 2（保本） → 价格上涨 0.5% 卖出（覆盖手续费），止损同上
Phase 3（强平） → 分 N 笔市价卖出，每笔间隔 30 秒，避免砸盘
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--entry-discount` | `0.001` | 入场折扣 0.1% |
| `--fish-target` | `0.018` | 止盈目标 +1.8% |
| `--breakeven` | `0.005` | 保本线 +0.5% |
| `--stop-loss` | `0.006` | 止损线 -0.6% |
| `--phase3-chunks` | `3` | Phase 3 拆单数 |

### PnL 估算

| 结果 | 毛利率 | 净利率（扣 0.3% 费） |
|------|--------|---------------------|
| FISH_HIT | +1.8% | **+1.5%** |
| BREAKEVEN_HIT | +0.5% | **+0.2%** |
| STOP_LOSS | -0.6% | **-0.9%** |

## 前置依赖

- **Node.js** >= 18
- **onchainos CLI** >= 3.0.0
  ```bash
  npx skills add okx/onchainos-skills
  export PATH="$HOME/.local/bin:$PATH"
  ```
- OKX Agentic Wallet 已认证：`onchainos wallet login`

## 仓库结构

```
gold-mining/
├── SKILL.md                         # 仓库根 skill（淘金套利 agent）
├── README.md
└── skills/
    └── low-slippage-maker/          # 低滑点 maker 策略
        ├── .claude-plugin/
        │   └── plugin.json          # Claude skill 注册元数据
        ├── plugin.yaml              # Plugin 清单
        ├── SKILL.md                 # AI Agent 执行指令
        ├── SUMMARY.md               # 用户摘要（英文）
        ├── LICENSE
        ├── references/
        │   └── strategy-config.md   # 策略参数详解
        └── scripts/
            ├── scan.js              # 代币扫描脚本
            └── trade.js             # 交易执行脚本
```

## 安全声明

- **风险等级：ADVANCED** — 自动化链上执行，15 分钟持仓周期
- 私钥由 onchainos CLI 通过 TEE 管理，脚本永不接触私钥
- `--dry-run true` 默认开启，实盘需双重人工确认
- 所有写操作带 `--strategy-id low-slippage-maker` 归因
- 建议单笔不超过钱包余额的 5%

## 触发关键词

**中文**: 低滑点、maker策略、模拟限价单、分段止盈、分阶段退出、扫链交易、刷量、保本刷量、链上做市、挂单策略

**English**: low slippage, maker strategy, limit order simulation, phased exit, scan and trade, volume farming

## 许可证

MIT — 详见 [LICENSE](skills/low-slippage-maker/LICENSE)
