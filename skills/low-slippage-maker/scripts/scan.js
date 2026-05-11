#!/usr/bin/env node
// Usage: node scan.js --chains 1,42161,8453 [--amount 100]
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const args = process.argv.slice(2);
const chains = (args[args.indexOf('--chains') + 1] ?? '1').split(',').map(Number);
const amount = args[args.indexOf('--amount') + 1] ?? '100';
const mock = args.includes('--mock');

if (mock) {
  const mockData = chains.flatMap((chainId, ci) =>
    ['TOKEN_A', 'TOKEN_B', 'TOKEN_C'].map((sym, i) => ({
      rank: ci * 3 + i + 1,
      chain: chainId,
      symbol: sym,
      address: `0x${String(ci * 3 + i + 1).padStart(40, '0')}`,
      price: +(1 + Math.random()).toFixed(4),
      priceImpact: +(Math.random() * 0.4).toFixed(3),
      change24h: +(Math.random() * 4 - 1).toFixed(2),
      volume24h: Math.floor(500000 + Math.random() * 2000000),
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

// Score: depth 50% + trend 30% + volume 20%
function score(impact, change24h, volume24h) {
  const depthScore = Math.max(0, 50 - impact * 100);
  const trendScore = (change24h >= -1 && change24h <= 5)
    ? 30 - Math.abs(change24h - 2) * 4
    : 0;
  const volScore = Math.min(20, (volume24h / 500000) * 10);
  return +(depthScore + trendScore + volScore).toFixed(1);
}

async function scanChain(chainId) {
  const candidates = await run(`onchainos signal list --chain ${chainId} --limit 20`);
  if (!candidates?.length) return [];

  const results = await Promise.all(
    candidates.slice(0, 20).map(async (token) => {
      const [priceData, quoteData] = await Promise.all([
        run(`onchainos market price --address ${token.address} --chain ${chainId}`),
        run(`onchainos swap quote --from native --to ${token.address} --amount ${amount} --chain ${chainId}`),
      ]);
      if (!priceData || !quoteData) return null;

      const change24h = priceData.priceChangePercent24h ?? 0;
      const volume24h = priceData.volume24h ?? 0;
      const impact = parseFloat(quoteData.priceImpactPercentage ?? '99');

      if (impact > 0.5) return null; // insufficient depth

      return {
        chain: chainId,
        symbol: token.symbol,
        address: token.address,
        price: priceData.price,
        priceImpact: impact,
        change24h,
        volume24h,
        score: score(impact, change24h, volume24h),
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
