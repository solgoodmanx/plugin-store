#!/usr/bin/env node

/**
 * BPB Lite public scanner.
 *
 * Public-safe reference workflow for Based Pings Bot.
 * Production posture is OKX OnchainOS first, with DexScreener as a support lane
 * for pair discovery and links, plus optional platform-native attribution and
 * Solana-native verification when configured.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const GLOBAL_ENV_PATH = path.join(os.homedir(), '.config', 'env', 'global.env');
const OKX_BASE_URL = 'https://web3.okx.com';
const SOLANA_CHAIN_INDEX = '501';

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvFile(GLOBAL_ENV_PATH);

function isLikelySolanaAddress(value) {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

function fmtUsd(n) {
  const value = Number(n ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function fmtPct(n, digits = 1) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function fmtAge(ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';
  const totalSeconds = Math.floor(value / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function chooseBestPair(pairs = []) {
  return [...pairs].sort((a, b) => {
    const liqA = Number(a?.liquidity?.usd ?? 0);
    const liqB = Number(b?.liquidity?.usd ?? 0);
    const volA = Number(a?.volume?.h24 ?? 0);
    const volB = Number(b?.volume?.h24 ?? 0);
    return (liqB - liqA) || (volB - volA);
  })[0] ?? null;
}

function normalizeTextParts(parts = []) {
  return parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map((part) => String(part ?? '').toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function toOkxTokenBody(ca) {
  return [{ chainIndex: SOLANA_CHAIN_INDEX, tokenContractAddress: ca }];
}

function getOkxAuthHeaders(method, pathWithQuery, body = '') {
  const key = process.env.OKX_API_KEY;
  const secret = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  if (!key || !secret || !passphrase) return null;
  const timestamp = new Date().toISOString();
  const payload = `${timestamp}${method}${pathWithQuery}${body}`;
  const sign = crypto.createHmac('sha256', secret).update(payload).digest('base64');
  return {
    'OK-ACCESS-KEY': key,
    'OK-ACCESS-SIGN': sign,
    'OK-ACCESS-PASSPHRASE': passphrase,
    'OK-ACCESS-TIMESTAMP': timestamp,
    'Content-Type': 'application/json',
  };
}

async function okxFetch(method, pathWithQuery, bodyObj) {
  const body = bodyObj ? JSON.stringify(bodyObj) : '';
  const headers = getOkxAuthHeaders(method, pathWithQuery, body);
  if (!headers) return null;
  const res = await fetch(`${OKX_BASE_URL}${pathWithQuery}`, { method, headers, ...(body ? { body } : {}) });
  if (!res.ok) throw new Error(`OKX request failed: ${res.status}`);
  const json = await res.json();
  if (json?.code !== '0') throw new Error(`OKX error ${json?.code ?? 'unknown'}: ${json?.msg ?? 'request failed'}`);
  return Array.isArray(json?.data) ? json.data : [];
}

async function fetchOkxSnapshot(ca) {
  try {
    const [basicInfoRows, priceInfoRows, holderRows] = await Promise.all([
      okxFetch('POST', '/api/v6/dex/market/token/basic-info', toOkxTokenBody(ca)),
      okxFetch('POST', '/api/v6/dex/market/price-info', toOkxTokenBody(ca)),
      okxFetch('GET', `/api/v6/dex/market/token/holder?chainIndex=${SOLANA_CHAIN_INDEX}&tokenContractAddress=${encodeURIComponent(ca)}`),
    ]);

    const basic = basicInfoRows?.[0] ?? null;
    const price = priceInfoRows?.[0] ?? null;
    const holdersList = Array.isArray(holderRows) ? holderRows : [];
    const top10Pct = holdersList.slice(0, 10).reduce((sum, row) => sum + Number(row?.percentage ?? row?.holdingRatio ?? 0), 0);

    return {
      available: Boolean(basic || price || holdersList.length),
      token: basic?.tokenName ?? basic?.name ?? null,
      symbol: basic?.tokenSymbol ?? basic?.symbol ?? null,
      marketCapUsd: Number(price?.marketCap ?? 0) || null,
      liquidityUsd: Number(price?.liquidity ?? 0) || null,
      volume5mUsd: Number(price?.volume5M ?? 0) || null,
      volume1hUsd: Number(price?.volume1H ?? 0) || null,
      volume4hUsd: Number(price?.volume4H ?? 0) || null,
      volume24hUsd: Number(price?.volume24H ?? 0) || null,
      holders: Number(price?.holders ?? 0) || null,
      top10Pct: top10Pct > 0 ? top10Pct : null,
      source: 'OKX OnchainOS',
    };
  } catch {
    return null;
  }
}

async function fetchDexScreener(ca) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
  if (!res.ok) throw new Error(`DexScreener request failed: ${res.status}`);
  const json = await res.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  return { pairs, bestPair: chooseBestPair(pairs) };
}

function toPrintrCaip10(ca) {
  return `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${ca}`;
}

async function fetchPrintrMetadata(ca) {
  const bearer = process.env.PRINTR_BEARER_TOKEN || process.env.BPB_PRINTR_BEARER_TOKEN;
  if (!bearer) return null;
  const url = `https://api-preview.printr.money/v0/tokens/${encodeURIComponent(toPrintrCaip10(ca))}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${bearer}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchHeliusHolderCount(ca) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'bpb-lite-holders',
        method: 'getTokenAccounts',
        params: { mint: ca, limit: 1000, displayOptions: {} },
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const tokenAccounts = json?.result?.token_accounts;
    return Array.isArray(tokenAccounts) ? tokenAccounts.length : null;
  } catch {
    return null;
  }
}

export function inferPlatform({ ca, bestPair, printr }) {
  if (printr?.id || printr?.tokenId) {
    return {
      platform: 'Printr',
      note: 'Direct platform-native metadata points to Printr as the launch source.',
      confidence: 'High',
    };
  }

  const baseText = normalizeTextParts([
    bestPair?.dexId,
    bestPair?.labels,
    bestPair?.url,
    bestPair?.baseToken?.name,
    bestPair?.baseToken?.symbol,
    bestPair?.quoteToken?.symbol,
    ca,
  ]);

  if (baseText.includes('pumpfun') || baseText.includes('pump.fun') || ca.toLowerCase().endsWith('pump')) {
    return { platform: 'Pumpfun', note: 'Pair and venue metadata suggest Pumpfun launch context or routing.', confidence: 'Medium' };
  }
  if (baseText.includes('launchlab')) {
    return { platform: 'LaunchLab', note: 'Public pair metadata suggests LaunchLab involvement.', confidence: 'Medium' };
  }
  if (baseText.includes('bonk')) {
    return { platform: 'Bonk', note: 'Pair metadata suggests Bonk ecosystem launch or routing context.', confidence: 'Medium' };
  }
  if (baseText.includes('bags')) {
    return { platform: 'Bags', note: 'Market metadata suggests Bags context in the launch or routing path.', confidence: 'Medium' };
  }
  if (baseText.includes('rise')) {
    return { platform: 'RISE', note: 'Public market metadata suggests RISE platform context.', confidence: 'Medium' };
  }
  if (baseText.includes('raydium')) {
    return { platform: 'Raydium', note: 'Pair metadata suggests Raydium as the active liquidity venue.', confidence: 'Medium' };
  }
  if (baseText.includes('meteora') || baseText.includes('damm') || baseText.includes('dbc')) {
    return {
      platform: 'Meteora',
      note: 'Pair metadata points to Meteora or DBC-style liquidity context, which may be venue rather than original launch source.',
      confidence: 'Medium',
    };
  }

  return { platform: 'Unresolved', note: 'Current public evidence does not yet cleanly resolve launch-source or venue context.', confidence: 'Low' };
}

export function inferSignal(snapshot = {}) {
  const mc = Number(snapshot.marketCapUsd ?? 0);
  const vol1h = Number(snapshot.volume1hUsd ?? 0);
  const liq = Number(snapshot.liquidityUsd ?? 0);
  const holders = Number(snapshot.holders ?? 0);
  const top10Pct = Number(snapshot.top10Pct ?? 0);

  if (mc > 0 && vol1h >= mc && liq >= 10000 && holders >= 150 && (top10Pct === 0 || top10Pct <= 35)) return 'EARLY';
  if (mc > 0 && vol1h >= mc * 0.6 && liq >= 8000) return 'MOMENTUM';
  return 'CONFIRMATION';
}

export function inferConfidence(snapshot = {}) {
  if (snapshot.attributionConfidence === 'High') return 'High';
  const mc = Number(snapshot.marketCapUsd ?? 0);
  const vol1h = Number(snapshot.volume1hUsd ?? 0);
  const liq = Number(snapshot.liquidityUsd ?? 0);
  const holders = Number(snapshot.holders ?? 0);
  const top10Pct = Number(snapshot.top10Pct ?? 0);
  if (mc > 0 && vol1h > 0 && liq >= 10000 && holders >= 150 && (top10Pct === 0 || top10Pct <= 45)) return 'High';
  if (mc > 0 && (vol1h > 0 || liq > 0)) return 'Medium';
  return 'Low';
}

function buildHeadline(signal) {
  if (signal === 'EARLY') return '🟣 EARLY';
  if (signal === 'MOMENTUM') return '🟢 MOMENTUM';
  return '🔵 CONFIRMATION';
}

function buildEvidence(snapshot) {
  const points = [];
  if (snapshot.primarySource === 'OKX OnchainOS') points.push('Primary structure comes from OKX OnchainOS, not just pair scraping');
  if (snapshot.attributionConfidence === 'High' && snapshot.platform === 'Printr') points.push('Direct Printr attribution resolved from platform-native metadata');
  if (Number(snapshot.volume1hUsd) > Number(snapshot.marketCapUsd) && Number(snapshot.marketCapUsd) > 0) points.push('1h volume is healthy relative to market cap');
  if (Number(snapshot.liquidityUsd) >= 10000) points.push('Liquidity is non-trivial for continued monitoring');
  if (Number(snapshot.top10Pct) > 0 && Number(snapshot.top10Pct) <= 35) points.push('Top-10 concentration is not extreme on the current read');
  if (Number(snapshot.holders) > 0 && Number(snapshot.holders) < 100) points.push('Holder count is still thin, so structure may be fragile');
  if (snapshot.platform === 'RISE') points.push('Platform evidence suggests RISE context for this move');
  if (snapshot.platform === 'Pumpfun') points.push('Context looks consistent with Pumpfun-style launch flow');
  if (points.length === 0) points.push('Current public evidence is incomplete, but the structure is still readable enough for a first-pass signal view');
  return [...new Set(points)];
}

function buildVerdict(snapshot) {
  const { signal, platform, marketCapUsd, volume1hUsd, liquidityUsd, holders, top10Pct } = snapshot;
  const lines = [];

  if (signal === 'EARLY') lines.push('Early traction is live and the structure still looks reasonably intact.');
  else if (signal === 'MOMENTUM') lines.push('This looks more like active continuation than a cold starter.');
  else lines.push('Structure looks more established here, with less asymmetry but cleaner confirmation.');

  if (platform === 'Printr') lines.push('Direct attribution supports treating Printr as the launch source in this read.');
  if (platform === 'Pumpfun') lines.push('The read fits a Pumpfun-style flow, which matters for how momentum is judged.');
  if (platform === 'Meteora') lines.push('Meteora reads here as liquidity context, not automatically the original launch source.');
  if (platform === 'RISE') lines.push('Platform context points to RISE, which changes how continuation should be interpreted.');
  if (Number(volume1hUsd) > Number(marketCapUsd) && Number(liquidityUsd) >= 10000) lines.push('Volume is healthy relative to market cap and liquidity is non-trivial.');
  if (Number(top10Pct) > 45) lines.push('Top holder concentration is elevated, so risk controls should stay tighter.');
  if (Number(holders) > 0 && Number(holders) < 100) lines.push('Holder count is still thin, so structure should be treated carefully.');

  return lines.join(' ');
}

function buildLinks(ca, bestPair) {
  const pairUrl = bestPair?.url || null;
  const lines = [];
  if (pairUrl) lines.push(`DEX: ${pairUrl}`);
  lines.push(`Explorer: https://solscan.io/token/${ca}`);
  lines.push(`X Search: https://x.com/search?q=${encodeURIComponent(ca)}`);
  return lines.join('\n');
}

function coalesceNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

function pickText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

async function buildScan(ca) {
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
  };

  snapshot.signal = inferSignal(snapshot);
  snapshot.confidence = inferConfidence(snapshot);
  snapshot.evidence = buildEvidence(snapshot);
  snapshot.verdict = buildVerdict(snapshot);
  snapshot.links = buildLinks(ca, bestPair);

  return `${buildHeadline(snapshot.signal)} · BPB Lite\n${snapshot.symbol} (${snapshot.token})\nCA: ${snapshot.contractAddress}\n\n🧠 Primary data: ${snapshot.primarySource}\n📍 Platform: ${snapshot.platform}\n🎯 Confidence: ${snapshot.confidence}\n💰 MC: ${fmtUsd(snapshot.marketCapUsd)}\n📊 Vol 1h: ${fmtUsd(snapshot.volume1hUsd)}\n💧 Liq: ${fmtUsd(snapshot.liquidityUsd)}\n⏳ Age: ${fmtAge(snapshot.ageMs)}\n🧩 Pairs seen: ${snapshot.pairCount}\n👥 Holders: ${snapshot.holders ?? '—'}${snapshot.verificationSource ? ` (${snapshot.verificationSource})` : ''}\n🏦 Top10: ${snapshot.top10Pct != null ? fmtPct(snapshot.top10Pct) : '—'}\n👀 Smart holders: ${snapshot.smartHolders ?? '—'}\n\nEvidence\n${snapshot.evidence.map((line) => `• ${line}`).join('\n')}\n\nVerdict\n${snapshot.verdict}\n\nPlatform note\n${snapshot.platformNote}\n\nLinks\n${snapshot.links}`;
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

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
