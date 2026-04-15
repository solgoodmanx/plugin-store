#!/usr/bin/env node

/**
 * BPB Lite public scanner.
 *
 * Public-safe reference workflow for Based Pings Bot.
 * Production posture is OKX OnchainOS first, with DexScreener as a support lane
 * for pair discovery and links, plus optional platform-native attribution and
 * Solana-native verification when configured.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { inferPlatform } from './lib/platforms.js';
import { buildEvidence, buildLinks, buildVerdict, renderScan } from './lib/render.js';
import { inferConfidence, inferSignal } from './lib/signal.js';
import { fetchDexScreener, fetchHeliusHolderCount, fetchOkxSnapshot, fetchPrintrMetadata } from './lib/sources.js';
import { coalesceNumber, GLOBAL_ENV_PATH, isLikelySolanaAddress, loadEnvFile, pickText } from './lib/utils.js';

loadEnvFile(GLOBAL_ENV_PATH);

export { inferPlatform } from './lib/platforms.js';
export { inferConfidence, inferSignal } from './lib/signal.js';

const PLATFORM_ADAPTERS = ['okx', 'dexscreener', 'helius', 'printr', 'pumpfun', 'bonk', 'meteora', 'bags', 'rise'];

export async function buildScanSnapshot(ca) {
  const [okx, dex, printr, heliusHolders] = await Promise.all([
    fetchOkxSnapshot(ca),
    fetchDexScreener(ca),
    fetchPrintrMetadata(ca).catch(() => null),
    fetchHeliusHolderCount(ca),
  ]);

  const pairs = dex?.pairs ?? [];
  const bestPair = dex?.bestPair ?? null;
  const platformHint = inferPlatform({ ca, bestPair, printr });

  const pairCreatedAt = Number(bestPair?.pairCreatedAt ?? 0);
  const ageMs = pairCreatedAt > 0 ? Date.now() - pairCreatedAt : null;
  const holders = coalesceNumber(okx?.holders, heliusHolders);

  const snapshot = {
    token: pickText(okx?.token, bestPair?.baseToken?.name, printr?.name) ?? 'UNKNOWN',
    symbol: pickText(okx?.symbol, bestPair?.baseToken?.symbol, printr?.symbol) ?? 'UNKNOWN',
    contractAddress: ca,
    platform: platformHint.platform,
    platformNote: platformHint.note,
    attributionConfidence: platformHint.confidence,
    marketCapUsd: coalesceNumber(okx?.marketCapUsd, bestPair?.marketCap, bestPair?.fdv) ?? 0,
    volume1hUsd: coalesceNumber(okx?.volume1hUsd, bestPair?.volume?.h1) ?? 0,
    liquidityUsd: coalesceNumber(okx?.liquidityUsd, bestPair?.liquidity?.usd) ?? 0,
    holders,
    top10Pct: okx?.top10Pct ?? null,
    smartHolders: null,
    ageMs,
    pairCount: pairs.length,
    dexId: bestPair?.dexId ?? null,
    primarySource: okx?.available ? 'OKX OnchainOS' : 'DexScreener',
    verificationSource: heliusHolders ? 'Helius Pro' : null,
    sourceAdapters: PLATFORM_ADAPTERS,
    rawSources: { okx, dex, printr, heliusHolders },
  };

  snapshot.signal = inferSignal(snapshot);
  snapshot.confidence = inferConfidence(snapshot);
  snapshot.evidence = buildEvidence(snapshot);
  snapshot.verdict = buildVerdict(snapshot);
  snapshot.links = buildLinks(ca, bestPair);

  return snapshot;
}

export async function buildScan(ca) {
  const snapshot = await buildScanSnapshot(ca);
  return renderScan(snapshot);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMainModule) {
  const ca = process.argv[2];

  if (!isLikelySolanaAddress(ca)) {
    console.error('Usage: node scripts/scan-token.js <solana-contract-address>');
    process.exit(1);
  }

  buildScan(ca)
    .then((output) => console.log(output))
    .catch((error) => {
      console.error(`BPB Lite scan failed: ${error.message}`);
      process.exit(1);
    });
}
