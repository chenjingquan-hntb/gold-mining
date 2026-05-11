#!/usr/bin/env node
// Usage: node calc_profit.js <toAmount> <fromAmount> <gasFee>
// Outputs: profit=N (negative means unprofitable)

const [, , toAmount, fromAmount, gasFee] = process.argv.map(BigInt);
const profit = toAmount - fromAmount - gasFee;
process.stdout.write(`profit=${profit}\n`);
process.exit(profit > 0n ? 0 : 1);
