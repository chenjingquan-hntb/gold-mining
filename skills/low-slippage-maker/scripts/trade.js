#!/usr/bin/env node
// Usage: node trade.js --chain 1 --from 0x... --to 0x... --amount 100000000 [--dry-run true]
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// --- CLI args ---
const argv = process.argv.slice(2);
const get = (k, def) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : def; };

const cfg = {
  chain:         get('--chain', '1'),
  from:          get('--from'),
  to:            get('--to'),
  amount:        get('--amount'),
  entryDiscount: parseFloat(get('--entry-discount', '0.0007')),
  fishTarget:    parseFloat(get('--fish-target',    '0.004')),
  breakeven:     parseFloat(get('--breakeven',      '0.0015')),
  stopLoss:      parseFloat(get('--stop-loss',      '0.005')),
  pollMs:        parseInt(get('--poll-sec',         '15')) * 1000,
  dryRun:        get('--dry-run', 'true') !== 'false',
};

if (!cfg.from || !cfg.to || !cfg.amount) {
  console.error('Missing required args: --from --to --amount'); process.exit(1);
}

// --- Helpers ---
const sleep = ms => new Promise(r => setTimeout(r, ms));

function log(phase, msg) {
  console.log(`[${new Date().toISOString()}][PHASE-${phase}] ${msg}`);
}

async function onchainos(args) {
  const { stdout } = await execAsync(`onchainos ${args}`);
  return JSON.parse(stdout.trim());
}

async function getPrice() {
  const d = await onchainos(`market price --address ${cfg.to} --chain ${cfg.chain}`);
  return parseFloat(d.data[0].price);
}

async function getQuote(fromToken, toToken, amount) {
  const d = await onchainos(
    `swap quote --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${cfg.chain}`
  );
  return d.data[0];
}

async function executeSwap(fromToken, toToken, amount, slippage) {
  if (cfg.dryRun) return '[DRY-RUN]';
  const d = await onchainos(
    `swap swap --from ${fromToken} --to ${toToken} --amount ${amount}` +
    ` --slippage ${slippage} --chain ${cfg.chain} --strategy-id low-slippage-maker`
  );
  return d.data[0].txHash;
}

// --- Phase functions ---

// Phase 0: poll until price <= entryTarget, then buy; timeout → market buy
async function simulateLimitBuy() {
  const refPrice = await getPrice();
  const entryTarget = refPrice * (1 - cfg.entryDiscount);
  log(0, `refPrice=${refPrice} entryTarget=${entryTarget.toFixed(8)}`);

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const price = await getPrice();
    if (price <= entryTarget) {
      log(0, `price=${price} <= target → buying`);
      const tx = await executeSwap(cfg.from, cfg.to, cfg.amount, 0.001);
      log(0, `bought tx=${tx} entryPrice=${price}`);
      return price;
    }
    log(0, `price=${price} waiting...`);
    await sleep(cfg.pollMs);
  }
  // timeout: market buy
  const price = await getPrice();
  log(0, `timeout → market buy at ${price}`);
  const tx = await executeSwap(cfg.from, cfg.to, cfg.amount, 0.001);
  log(0, `bought tx=${tx} entryPrice=${price}`);
  return price;
}

// Phase 1: fishing 0-5min
async function runPhase1(entryPrice) {
  const fishSell  = entryPrice * (1 + cfg.fishTarget);
  const stopPrice = entryPrice * (1 - cfg.stopLoss);
  log(1, `fishSell=${fishSell.toFixed(8)} stopLoss=${stopPrice.toFixed(8)}`);

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const price = await getPrice();
    if (price >= fishSell) {
      const tx = await executeSwap(cfg.to, cfg.from, cfg.amount, 0.001);
      log(1, `FISH_HIT price=${price} tx=${tx}`);
      return { result: 'FISH_HIT', exitPrice: price };
    }
    if (price <= stopPrice) {
      const tx = await executeSwap(cfg.to, cfg.from, cfg.amount, 0.005);
      log(1, `STOP_LOSS price=${price} tx=${tx}`);
      return { result: 'STOP_LOSS', exitPrice: price };
    }
    log(1, `price=${price} holding...`);
    await sleep(cfg.pollMs);
  }
  return { result: 'TIMEOUT' };
}

// Phase 2: breakeven 5-10min
async function runPhase2(entryPrice) {
  const beSell    = entryPrice * (1 + cfg.breakeven);
  const stopPrice = entryPrice * (1 - cfg.stopLoss);
  log(2, `breakevenSell=${beSell.toFixed(8)} stopLoss=${stopPrice.toFixed(8)}`);

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const price = await getPrice();
    if (price >= beSell) {
      const tx = await executeSwap(cfg.to, cfg.from, cfg.amount, 0.001);
      log(2, `BREAKEVEN_HIT price=${price} tx=${tx}`);
      return { result: 'BREAKEVEN_HIT', exitPrice: price };
    }
    if (price <= stopPrice) {
      const tx = await executeSwap(cfg.to, cfg.from, cfg.amount, 0.005);
      log(2, `STOP_LOSS price=${price} tx=${tx}`);
      return { result: 'STOP_LOSS', exitPrice: price };
    }
    log(2, `price=${price} holding...`);
    await sleep(cfg.pollMs);
  }
  return { result: 'TIMEOUT' };
}

// Phase 3: forced market exit
async function runPhase3(entryPrice) {
  const price = await getPrice();
  const tx = await executeSwap(cfg.to, cfg.from, cfg.amount, 0.001);
  log(3, `FORCED_EXIT price=${price} tx=${tx}`);
  return { result: 'FORCED_EXIT', exitPrice: price };
}

// --- Main ---
async function main() {
  log(0, `Starting trade dryRun=${cfg.dryRun} chain=${cfg.chain}`);

  // Depth pre-check
  const quote = await getQuote(cfg.from, cfg.to, cfg.amount);
  if (Math.abs(parseFloat(quote.priceImpactPercent ?? '0')) > 0.5) {
    console.error(`ABORT: priceImpact=${quote.priceImpactPercent}% > 0.5%`);
    process.exit(1);
  }

  const entryPrice = await simulateLimitBuy();

  let exit = await runPhase1(entryPrice);
  if (exit.result === 'TIMEOUT') exit = await runPhase2(entryPrice);
  if (exit.result === 'TIMEOUT') exit = await runPhase3(entryPrice);

  const pnl    = exit.exitPrice - entryPrice;
  const pnlPct = ((pnl / entryPrice) * 100).toFixed(4);
  console.log(
    `SUMMARY: result=${exit.result} entryPrice=${entryPrice} exitPrice=${exit.exitPrice} pnl=${pnl.toFixed(8)} pnlPct=${pnlPct}%`
  );
}

main().catch(e => { console.error(e.message); process.exit(1); });
