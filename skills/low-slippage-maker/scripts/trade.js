#!/usr/bin/env node
// Usage: node trade.js --chain 1 --from 0x... --to 0x... --amount 100000000 [--dry-run true]
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// --- CLI args ---
const argv = process.argv.slice(2);
const get = (k, def) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : def; };

const WALLET = {
  solana: 'GyWyYWA1sRdFqPcZ5TBrraaAHwUfMKKjFGW9Aujr1bz1',
  default: '0x12769e3b1aa776cf6380788d3065d8e50d93022a',
};
function walletAddr(chain) { return WALLET[chain?.toLowerCase()] || WALLET.default; }

const cfg = {
  chain:         get('--chain', 'solana'),
  from:          get('--from'),
  to:            get('--to'),
  amount:        get('--amount'),
  entryDiscount: parseFloat(get('--entry-discount', '0.001')),
  fishTarget:    parseFloat(get('--fish-target',    '0.018')),
  breakeven:     parseFloat(get('--breakeven',      '0.005')),
  stopLoss:      parseFloat(get('--stop-loss',      '0.006')),
  pollMs:        parseInt(get('--poll-sec',         '15')) * 1000,
  phase3Chunks:  parseInt(get('--phase3-chunks',    '3')),
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

async function onchainos(args, retries = 1) {
  let delay = 500;
  for (let i = 0; i < retries; i++) {
    try {
      const { stdout } = await execAsync(`onchainos ${args}`, { timeout: 60000 });
      const start = stdout.search(/[{[]/);
      if (start === -1) throw new Error(`no JSON in output`);
      return JSON.parse(stdout.slice(start));
    } catch (e) {
      if (i === retries - 1) throw e;
      log('RETRY', `attempt ${i + 1} failed: ${e.message}`);
      await sleep(delay);
      delay *= 2;
    }
  }
}

async function getPrice() {
  // Use swap quote for real-time price — market price endpoint is cached
  const q = await onchainos(
    `swap quote --from ${cfg.to} --to ${cfg.from} --readable-amount 0.01 --chain ${cfg.chain}`
  );
  const toAmount = parseFloat(q.data[0]?.toTokenAmount ?? '0');
  if (!toAmount || toAmount <= 0) throw new Error(`invalid quote: toAmount=${q.data[0]?.toTokenAmount}`);
  // Implied price: how many from-tokens for X to-tokens
  return toAmount / 0.01;
}

async function getQuote(fromToken, toToken, amount) {
  const d = await onchainos(
    `swap quote --from ${fromToken} --to ${toToken} --amount ${amount} --chain ${cfg.chain}`
  );
  return d.data[0];
}

async function getTokenBalance(tokenAddr) {
  const addr = tokenAddr || cfg.to;
  const d = await onchainos(`wallet balance --chain ${cfg.chain} --token-address ${addr}`);
  const details = d?.data?.details ?? [];
  for (const acct of details) {
    for (const ta of acct?.tokenAssets ?? []) {
      const taAddr = ta?.tokenAddress || ta?.address || '';
      if (taAddr.toLowerCase() === addr.toLowerCase()) {
        return ta?.rawBalance ?? ta?.balance ?? '0';
      }
    }
  }
  return '0';
}

async function executeSwap(fromToken, toToken, amount, slippage) {
  if (cfg.dryRun) return '[DRY-RUN]';
  const d = await onchainos(
    `swap execute --from ${fromToken} --to ${toToken} --amount ${amount}` +
    ` --slippage ${slippage} --chain ${cfg.chain}` +
    ` --wallet ${walletAddr(cfg.chain)}`
  );
  const result = d?.data;
  if (typeof result === 'object' && !Array.isArray(result)) {
    return result.swapTxHash || result.orderId || JSON.stringify(result);
  }
  return d.data?.[0]?.txHash || d.data?.[0]?.orderId || 'submitted';
}

// --- Signal handling ---
let _position = null;

async function emergencyExit(sig) {
  log('SIG', `${sig} received`);
  if (_position) {
    try {
      const bal = await getTokenBalance();
      if (bal !== '0') {
        const tx = await executeSwap(cfg.to, cfg.from, bal, 0.01);
        log('SIG', `emergency exit tx=${tx}`);
      }
    } catch (e) {
      log('SIG', `emergency exit FAILED: ${e.message} — manual close required`);
    }
  }
  process.exit(0);
}

process.on('SIGINT',  () => emergencyExit('SIGINT'));
process.on('SIGTERM', () => emergencyExit('SIGTERM'));

// --- Phase functions ---

async function sell(phase, slippage) {
  const bal = await getTokenBalance();
  if (bal === '0') { log(phase, 'WARN: balance=0, skip sell'); return null; }
  return executeSwap(cfg.to, cfg.from, bal, slippage);
}

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
      const tx = await executeSwap(cfg.from, cfg.to, cfg.amount, 0.005);
      log(0, `bought tx=${tx} entryPrice=${price}`);
      _position = { phase: 1 };
      return price;
    }
    log(0, `price=${price} waiting...`);
    await sleep(cfg.pollMs);
  }
  // timeout: market buy
  const price = await getPrice();
  log(0, `timeout → market buy at ${price}`);
  const tx = await executeSwap(cfg.from, cfg.to, cfg.amount, 0.005);
  log(0, `bought tx=${tx} entryPrice=${price}`);
  _position = { phase: 1 };
  return price;
}

// Phase 1: fishing 0-5min
async function runPhase1(entryPrice) {
  _position.phase = 1;
  const fishSell  = entryPrice * (1 + cfg.fishTarget);
  const stopPrice = entryPrice * (1 - cfg.stopLoss);
  log(1, `fishSell=${fishSell.toFixed(8)} stopLoss=${stopPrice.toFixed(8)}`);

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const price = await getPrice();
    if (price >= fishSell) {
      const tx = await sell(1, 0.005);
      log(1, `FISH_HIT price=${price} tx=${tx}`);
      _position = null;
      return { result: 'FISH_HIT', exitPrice: price };
    }
    if (price <= stopPrice) {
      const tx = await sell(1, 0.01);
      log(1, `STOP_LOSS price=${price} tx=${tx}`);
      _position = null;
      return { result: 'STOP_LOSS', exitPrice: price };
    }
    log(1, `price=${price} holding...`);
    await sleep(cfg.pollMs);
  }
  return { result: 'TIMEOUT' };
}

// Phase 2: breakeven 5-10min
async function runPhase2(entryPrice) {
  _position.phase = 2;
  const beSell    = entryPrice * (1 + cfg.breakeven);
  const stopPrice = entryPrice * (1 - cfg.stopLoss);
  log(2, `breakevenSell=${beSell.toFixed(8)} stopLoss=${stopPrice.toFixed(8)}`);

  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const price = await getPrice();
    if (price >= beSell) {
      const tx = await sell(2, 0.005);
      log(2, `BREAKEVEN_HIT price=${price} tx=${tx}`);
      _position = null;
      return { result: 'BREAKEVEN_HIT', exitPrice: price };
    }
    if (price <= stopPrice) {
      const tx = await sell(2, 0.01);
      log(2, `STOP_LOSS price=${price} tx=${tx}`);
      _position = null;
      return { result: 'STOP_LOSS', exitPrice: price };
    }
    log(2, `price=${price} holding...`);
    await sleep(cfg.pollMs);
  }
  return { result: 'TIMEOUT' };
}

// Phase 3: forced market exit — split into chunks to avoid slippage
async function runPhase3(entryPrice) {
  _position.phase = 3;
  const price = await getPrice();
  const chunks = cfg.phase3Chunks;
  const INTERVAL_MS = 30000;  // 30s between chunks to let pool rebalance

  log(3, `FORCED_EXIT splitting into ${chunks} chunks, 30s apart`);
  for (let i = 0; i < chunks; i++) {
    const bal = await getTokenBalance();
    if (bal === '0') { log(3, 'balance=0, done'); break; }

    const remaining = chunks - i;
    const chunkAmt = String(BigInt(bal) / BigInt(remaining));
    if (chunkAmt === '0') break;

    const tx = await executeSwap(cfg.to, cfg.from, chunkAmt, 0.005);
    log(3, `FORCED_EXIT [${i + 1}/${chunks}] amt=${chunkAmt} tx=${tx}`);

    if (i < chunks - 1) await sleep(INTERVAL_MS);
  }

  _position = null;
  return { result: 'FORCED_EXIT', exitPrice: price };
}

// --- Main ---
async function main() {
  log(0, `Starting trade dryRun=${cfg.dryRun} chain=${cfg.chain}`);

  // Balance pre-check
  const fromBal = await getTokenBalance(cfg.from);
  if (BigInt(fromBal) < BigInt(cfg.amount)) {
    console.error(`ABORT: insufficient balance ${fromBal} < ${cfg.amount}`); process.exit(1);
  }

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

  const FEE_RATE = 0.003;
  const grossPct = (exit.exitPrice - entryPrice) / entryPrice;
  const netPct   = grossPct - FEE_RATE;
  console.log(
    `SUMMARY: result=${exit.result} entryPrice=${entryPrice} exitPrice=${exit.exitPrice}` +
    ` grossPnl=${(grossPct * 100).toFixed(4)}% netPnl=${(netPct * 100).toFixed(4)}%`
  );
}

main().catch(e => { console.error(e.message); process.exit(1); });
