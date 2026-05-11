#!/usr/bin/env node
// Usage: node scan.js --chains solana,xlayer [--competition] [--quote <addr>]
//        [--min-volume 500000] [--min-liquidity 100000] [--min-holders 500] [--mock]
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const args = process.argv.slice(2);
const get = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };

const chains      = get('--chains', 'solana,xlayer').split(',');
const quoteArg    = get('--quote', '');          // explicit quote token address
const competition = args.includes('--competition');
const minVolume   = get('--min-volume', '20000');
const minLiquidity= get('--min-liquidity', '20000');
const minHolders  = get('--min-holders', '300');
const rankBy      = get('--rank-by', '7');
const mock        = args.includes('--mock');

// Chain-specific quote token defaults
const CHAIN_QUOTES = {
  solana:    { addr: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', symbol: 'USDC', decimals: 6 },
  xlayer:    { addr: '0x779ded0c9e1022225f8e0630b35a9b54be713736',    symbol: 'USDT', decimals: 6 },
  ethereum:  { addr: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', symbol: 'USDC', decimals: 6 },
  base:      { addr: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', symbol: 'USDC', decimals: 6 },
  arbitrum:  { addr: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',    symbol: 'USDC', decimals: 6 },
};

// Competition filter: exclude stablecoins, wrapped natives, mainnet coins
const EXCLUDE_SYMBOLS = new Set([
  'USDC','USDT','DAI','USDS','USDe','FRAX','TUSD','BUSD','FDUSD','PYUSD',
  'USDY','sUSD','crvUSD','GHO','USX','CASH','JupUSD','syrupUSDC',
  'SOL','ETH','BTC','OKB','BNB','MATIC','AVAX','TRX','XRP','ADA','DOT',
  'wSOL','wETH','wBTC','wOKB','WSOL','WETH','WBTC','WOKB',
  'xSOL','xETH','xBTC','xOKB',
]);

// Competition filter: name patterns to exclude
const EXCLUDE_NAME_PATTERNS = [
  /wrapped/i, /staked/i, /liquid staking/i, /bridge/i,
  /stablecoin/i, /stable coin/i, /USD coin/i, /USD$/i,
  /syrup/i, /jupiter usd/i, /^OKX Wrapped/i,
];

if (mock) {
  const mockData = chains.flatMap((chain, ci) =>
    ['TOKEN_A', 'TOKEN_B', 'TOKEN_C'].map((sym, i) => ({
      rank: ci * 3 + i + 1, chain, symbol: sym,
      address: `0x${String(ci * 3 + i + 1).padStart(40, '0')}`,
      price: +(1 + Math.random()).toFixed(4),
      priceImpact: +(Math.random() * 0.4).toFixed(3),
      change24h: +(Math.random() * 4 - 1).toFixed(2),
      volume24h: Math.floor(500000 + Math.random() * 2000000),
      liquidity: Math.floor(100000 + Math.random() * 1000000),
      holders: Math.floor(500 + Math.random() * 5000),
      score: +(60 + Math.random() * 30).toFixed(1),
      eligible: true,
    }))
  ).sort((a, b) => b.score - a.score).slice(0, 3).map((t, i) => ({ ...t, rank: i + 1 }));
  console.log(JSON.stringify(mockData, null, 2));
  process.exit(0);
}

async function run(cmd, timeoutMs = 10000) {
  try {
    const { stdout } = await Promise.race([
      execAsync(cmd),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
    const start = stdout.search(/[{[]/);
    if (start === -1) throw new Error('no JSON in output');
    return JSON.parse(stdout.slice(start));
  } catch (e) {
    const tag = e.message === 'timeout' ? 'TIMEOUT' : 'PARSE_ERR';
    process.stderr.write(`[SCAN][${tag}] ${cmd.slice(0, 80)}: ${e.message}\n`);
    return null;
  }
}

function isCompetitionEligible(symbol, name) {
  const sym = (symbol || '').trim();
  const nm  = (name || '').trim();
  if (EXCLUDE_SYMBOLS.has(sym) || EXCLUDE_SYMBOLS.has(sym.toUpperCase())) return false;
  for (const pat of EXCLUDE_NAME_PATTERNS) {
    if (pat.test(sym) || pat.test(nm)) return false;
  }
  return true;
}

// Score: depth 40% + trend 25% + volume 20% + holders 10% + uniqueTraders 5%
function score(impact, change24h, volume24h, holders, uniqueTraders) {
  const depthScore   = Math.max(0, 40 - impact * 80);
  const trendScore   = (change24h >= -1 && change24h <= 5) ? 25 - Math.abs(change24h - 2) * 4 : 0;
  const volScore     = Math.min(20, (volume24h / 20000) * 10);
  const holdersScore = Math.min(10, (holders / 300) * 3);
  const traderScore  = Math.min(5, (uniqueTraders / 100) * 2.5);
  return +(depthScore + trendScore + volScore + holdersScore + traderScore).toFixed(1);
}

async function scanChain(chain) {
  const quoteConfig = CHAIN_QUOTES[chain.toLowerCase()];
  const quoteAddr = quoteArg || (quoteConfig ? quoteConfig.addr : null);
  if (!quoteAddr) {
    process.stderr.write(`[SCAN][SKIP] chain=${chain}: no quote token configured\n`);
    return [];
  }

  // Step 1: get hot tokens
  const resp = await run(
    `onchainos token hot-tokens --chain ${chain}` +
    ` --rank-by ${rankBy} --time-frame 4` +
    ` --volume-min ${minVolume}` +
    ` --liquidity-min ${minLiquidity}` +
    ` --risk-filter true` +
    ` --stable-token-filter true` +
    ` --limit 30`
  );
  const candidates = resp?.data;
  if (!candidates?.length) return [];

  // Step 2: filter + get quotes
  let filtered = 0, quoted = 0, passed = 0;
  const results = await Promise.all(
    candidates.map(async (item) => {
      const address = item.tokenContractAddress;
      const symbol  = (item.tokenSymbol || '').trim();
      const name    = item.tokenName || '';
      if (!address) return null;
      filtered++;

      // Competition filter
      if (competition && !isCompetitionEligible(symbol, name)) {
        process.stderr.write(`[SCAN][FILTER] chain=${chain} symbol=${symbol} → excluded by competition rules\n`);
        return null;
      }

      // Step 3: get swap quote with configured quote token
      const quoteKey = competition ? 10 : 100;   // smaller amount for competition scanning
      const quoteAmt = competition ? `--readable-amount 1` : `--amount 100000000`;
      const quoteData = await run(
        `onchainos swap quote --from ${quoteAddr} --to ${address} ${quoteAmt} --chain ${chain}`
      );
      const quoteRaw = quoteData?.data?.[0];
      if (!quoteRaw) return null;
      quoted++;

      const impact        = Math.abs(parseFloat(quoteRaw.priceImpactPercent ?? '99'));
      const change24h     = parseFloat(item.change ?? 0);
      const volume24h     = parseFloat(item.volume ?? 0);
      const liquidity     = parseFloat(item.liquidity ?? 0);
      const holders       = parseInt(item.holders ?? 0);
      const uniqueTraders = parseInt(item.uniqueTraders ?? 0);

      if (impact > 0.5) return null;
      passed++;

      return {
        chain, symbol, address,
        priceImpact: impact,
        change24h, volume24h, liquidity, holders, uniqueTraders,
        eligible: !competition || isCompetitionEligible(symbol, name),
        score: score(impact, change24h, volume24h, holders, uniqueTraders),
      };
    })
  );

  process.stderr.write(`[SCAN] chain=${chain} candidates=${filtered} quoted=${quoted} passed=${passed}\n`);
  return results
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((t, i) => ({ rank: i + 1, ...t }));
}

const allResults = (await Promise.all(chains.map(scanChain))).flat();
allResults.sort((a, b) => b.score - a.score);
allResults.forEach((t, i) => { t.rank = i + 1; });

console.log(JSON.stringify(allResults.slice(0, 5), null, 2));
