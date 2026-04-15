import test from 'node:test';
import assert from 'node:assert/strict';
import { inferPlatform, inferSignal, inferConfidence, buildScanSnapshot } from '../scripts/scan-token.js';

test('inferPlatform returns Printr on direct attribution', () => {
  const result = inferPlatform({
    ca: '29CWsqH84TykHDDwA6DtETUtXQPuKbVgKCmxtkBsbrrr',
    printr: { id: 'abc123' },
    bestPair: null,
  });
  assert.equal(result.platform, 'Printr');
  assert.equal(result.confidence, 'High');
});

test('inferPlatform detects Meteora from pair metadata', () => {
  const result = inferPlatform({
    ca: 'Example1111111111111111111111111111111111111',
    printr: null,
    bestPair: { dexId: 'meteora', labels: ['damm-v2'], url: 'https://dexscreener.com/solana/example' },
  });
  assert.equal(result.platform, 'Meteora');
  assert.equal(result.confidence, 'Medium');
});

test('inferPlatform detects Pumpfun from pair metadata', () => {
  const result = inferPlatform({
    ca: 'Pump111111111111111111111111111111111111111',
    printr: null,
    bestPair: { dexId: 'pumpfun', labels: ['launch'], url: 'https://dexscreener.com/solana/example' },
  });
  assert.equal(result.platform, 'Pumpfun');
  assert.equal(result.confidence, 'Medium');
});

test('inferPlatform detects Bonk from pair metadata', () => {
  const result = inferPlatform({
    ca: 'Bonk111111111111111111111111111111111111111',
    printr: null,
    bestPair: { dexId: 'raydium', labels: ['bonk'], url: 'https://dexscreener.com/solana/example' },
  });
  assert.equal(result.platform, 'Bonk');
});

test('inferPlatform detects Bags from pair metadata', () => {
  const result = inferPlatform({
    ca: 'Bags111111111111111111111111111111111111111',
    printr: null,
    bestPair: { dexId: 'raydium', labels: ['bags'], url: 'https://dexscreener.com/solana/example' },
  });
  assert.equal(result.platform, 'Bags');
});

test('inferPlatform detects RISE from pair metadata', () => {
  const result = inferPlatform({
    ca: 'Rise111111111111111111111111111111111111111',
    printr: null,
    bestPair: { dexId: 'raydium', labels: ['rise'], url: 'https://dexscreener.com/solana/example' },
  });
  assert.equal(result.platform, 'RISE');
});

test('inferSignal returns EARLY for strong structure', () => {
  const result = inferSignal({ marketCapUsd: 40000, volume1hUsd: 50000, liquidityUsd: 15000, holders: 180, top10Pct: 24 });
  assert.equal(result, 'EARLY');
});

test('inferSignal returns CONFIRMATION for lower relative volume', () => {
  const result = inferSignal({ marketCapUsd: 100000, volume1hUsd: 40000, liquidityUsd: 12000, holders: 300 });
  assert.equal(result, 'CONFIRMATION');
});

test('inferConfidence falls to Low for sparse unknown structure', () => {
  const result = inferConfidence({
    attributionConfidence: 'Low',
    marketCapUsd: 0,
    volume1hUsd: 0,
    liquidityUsd: 0,
    holders: null,
  });
  assert.equal(result, 'Low');
});

test('inferConfidence stays Medium for partial but usable structure', () => {
  const result = inferConfidence({
    attributionConfidence: 'Medium',
    marketCapUsd: 120000,
    volume1hUsd: 25000,
    liquidityUsd: 9000,
    holders: 90,
    top10Pct: 58,
  });
  assert.equal(result, 'Medium');
});

test('buildScanSnapshot exposes explicit source adapter list', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('api.dexscreener.com')) {
      return {
        ok: true,
        json: async () => ({
          pairs: [{
            dexId: 'pumpfun',
            labels: ['launch'],
            url: 'https://dexscreener.com/solana/example',
            baseToken: { name: 'Test', symbol: 'TEST' },
            liquidity: { usd: 9000 },
            volume: { h1: 12000, h24: 40000 },
            marketCap: 25000,
            pairCreatedAt: Date.now() - 60_000,
          }],
        }),
      };
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const oldOkxKey = process.env.OKX_API_KEY;
  const oldHeliusKey = process.env.HELIUS_API_KEY;
  const oldPrintrKey = process.env.PRINTR_BEARER_TOKEN;
  delete process.env.OKX_API_KEY;
  delete process.env.HELIUS_API_KEY;
  delete process.env.PRINTR_BEARER_TOKEN;

  try {
    const snapshot = await buildScanSnapshot('Pump111111111111111111111111111111111111111');
    assert.equal(snapshot.primarySource, 'DexScreener');
    assert.deepEqual(snapshot.sourceAdapters, ['okx', 'dexscreener', 'helius', 'printr', 'pumpfun', 'bonk', 'meteora', 'bags', 'rise']);
    assert.equal(snapshot.platform, 'Pumpfun');
  } finally {
    global.fetch = originalFetch;
    if (oldOkxKey) process.env.OKX_API_KEY = oldOkxKey;
    if (oldHeliusKey) process.env.HELIUS_API_KEY = oldHeliusKey;
    if (oldPrintrKey) process.env.PRINTR_BEARER_TOKEN = oldPrintrKey;
  }
});
