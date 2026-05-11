#!/usr/bin/env node
// Usage: node scan.js --chains solana,xlayer [--amount 100000000] [--min-volume 500000]
//        [--min-liquidity 100000] [--min-holders 500] [--rank-by 7] [--mock]
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const args = process.argv.slice(2);
const get = (k, def) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : def; };

const chains      = get('--chains', 'solana,xlayer').split(',');
const amount      = get('--amount', '100000000');
const minVolume   = get('--min-volume', '500000');
const minLiquidity= get('--min-liquidity', '100000');
const minHolders  = get('--min-holders', '500');
const rankBy      = get('--rank-by', '7');
const mock        = args.includes('--mock');

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
    return JSON.parse(stdout.trim());
  } catch {
    return null;
  }
}

// Score: depth 40% + trend 25% + volume 20% + holders 10% + uniqueTraders 5%
function score(impact, change24h, volume24h, holders, uniqueTraders) {
  const depthScore   = Math.max(0, 40 - impact * 80);
  const trendScore   = (change24h >= -1 && change24h <= 5) ? 25 - Math.abs(change24h - 2) * 4 : 0;
  const volScore     = Math.min(20, (volume24h / 500000) * 10);
  const holdersScore = Math.min(10, (holders / 500) * 5);
  const traderScore  = Math.min(5, (uniqueTraders / 100) * 2.5);
  return +(depthScore + trendScore + volScore + holdersScore + traderScore).toFixed(1);
}

async function scanChain(chain) {
  const resp = await run(
    `onchainos token hot-tokens --chain ${chain}` +
    ` --rank-by ${rankBy} --time-frame 4` +
    ` --volume-min ${minVolume}` +
    ` --liquidity-min ${minLiquidity}` +
    ` --risk-filter true` +
    ` --stable-token-filter true` +
    ` --limit 20`
  );
  const candidates = resp?.data;
  if (!candidates?.length) return [];

  const results = await Promise.all(
    candidates.map(async (item) => {
      const address = item.tokenContractAddress;
      const symbol  = item.tokenSymbol;
      if (!address) return null;

      const quoteData = await run(
        `onchainos swap quote --from native --to ${address} --amount ${amount} --chain ${chain}`
      );
      const quoteRaw = quoteData?.data?.[0];
      if (!quoteRaw) return null;

      const impact        = Math.abs(parseFloat(quoteRaw.priceImpactPercent ?? '99'));
      const change24h     = parseFloat(item.change ?? 0);
      const volume24h     = parseFloat(item.volume ?? 0);
      const liquidity     = parseFloat(item.liquidity ?? 0);
      const holders       = parseInt(item.holders ?? 0);
      const uniqueTraders = parseInt(item.uniqueTraders ?? 0);
      const price         = parseFloat(quoteRaw.toTokenAmount && item.price ? item.price : 0);

      if (impact > 0.5) return null;

      return {
        chain, symbol, address, price, priceImpact: impact,
        change24h, volume24h, liquidity, holders, uniqueTraders,
        score: score(impact, change24h, volume24h, holders, uniqueTraders),
      };
    })
  );

  return results
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((t, i) => ({ rank: i + 1, ...t }));
}

const allResults = (await Promise.all(chains.map(scanChain))).flat();
allResults.sort((a, b) => b.score - a.score);
allResults.forEach((t, i) => { t.rank = i + 1; });

console.log(JSON.stringify(allResults.slice(0, 3), null, 2));
