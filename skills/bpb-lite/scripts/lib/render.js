import { fmtAge, fmtPct, fmtUsd } from './utils.js';
import { buildHeadline } from './signal.js';

export function buildEvidence(snapshot) {
  const points = [];
  if (snapshot.primarySource === 'OKX OnchainOS') points.push('Primary structure comes from OKX OnchainOS, not just pair scraping');
  if (snapshot.attributionConfidence === 'High' && snapshot.platform === 'Printr') points.push('Direct Printr attribution resolved from platform-native metadata');
  if (Number(snapshot.volume1hUsd) > Number(snapshot.marketCapUsd) && Number(snapshot.marketCapUsd) > 0) points.push('1h volume is healthy relative to market cap');
  if (Number(snapshot.liquidityUsd) >= 10000) points.push('Liquidity is non-trivial for continued monitoring');
  if (Number(snapshot.top10Pct) > 0 && Number(snapshot.top10Pct) <= 35) points.push('Top-10 concentration is not extreme on the current read');
  if (Number(snapshot.holders) > 0 && Number(snapshot.holders) < 100) points.push('Holder count is still thin, so structure may be fragile');
  if (snapshot.platform === 'RISE') points.push('Platform evidence suggests RISE context for this move');
  if (snapshot.platform === 'Pumpfun') points.push('Context looks consistent with Pumpfun-style launch flow');
  if (snapshot.platform === 'Bonk') points.push('Bonk ecosystem context is part of the current read');
  if (snapshot.platform === 'Bags') points.push('Bags context is visible in the routing or launch evidence');
  if (snapshot.platform === 'Meteora') points.push('Meteora shows up here as liquidity-rail context, not blindly as launch source');
  if (points.length === 0) points.push('Current public evidence is incomplete, but the structure is still readable enough for a first-pass signal view');
  return [...new Set(points)];
}

export function buildVerdict(snapshot) {
  const { signal, platform, marketCapUsd, volume1hUsd, liquidityUsd, holders, top10Pct } = snapshot;
  const lines = [];

  if (signal === 'EARLY') lines.push('Early traction is live and the structure still looks reasonably intact.');
  else if (signal === 'MOMENTUM') lines.push('This looks more like active continuation than a cold starter.');
  else lines.push('Structure looks more established here, with less asymmetry but cleaner confirmation.');

  if (platform === 'Printr') lines.push('Direct attribution supports treating Printr as the launch source in this read.');
  if (platform === 'Pumpfun') lines.push('The read fits a Pumpfun-style flow, which matters for how momentum is judged.');
  if (platform === 'Bonk') lines.push('Bonk context matters here because ecosystem routing can shape the move quality.');
  if (platform === 'Bags') lines.push('Bags context is relevant to how this setup should be interpreted.');
  if (platform === 'Meteora') lines.push('Meteora reads here as liquidity context, not automatically the original launch source.');
  if (platform === 'RISE') lines.push('Platform context points to RISE, which changes how continuation should be interpreted.');
  if (Number(volume1hUsd) > Number(marketCapUsd) && Number(liquidityUsd) >= 10000) lines.push('Volume is healthy relative to market cap and liquidity is non-trivial.');
  if (Number(top10Pct) > 45) lines.push('Top holder concentration is elevated, so risk controls should stay tighter.');
  if (Number(holders) > 0 && Number(holders) < 100) lines.push('Holder count is still thin, so structure should be treated carefully.');

  return lines.join(' ');
}

export function buildLinks(ca, bestPair) {
  const pairUrl = bestPair?.url || null;
  const lines = [];
  if (pairUrl) lines.push(`DEX: ${pairUrl}`);
  lines.push(`Explorer: https://solscan.io/token/${ca}`);
  lines.push(`X Search: https://x.com/search?q=${encodeURIComponent(ca)}`);
  return lines.join('\n');
}

export function renderScan(snapshot) {
  return `${buildHeadline(snapshot.signal)} · BPB Lite\n${snapshot.symbol} (${snapshot.token})\nCA: ${snapshot.contractAddress}\n\n🧠 Primary data: ${snapshot.primarySource}\n📍 Platform: ${snapshot.platform}\n🎯 Confidence: ${snapshot.confidence}\n💰 MC: ${fmtUsd(snapshot.marketCapUsd)}\n📊 Vol 1h: ${fmtUsd(snapshot.volume1hUsd)}\n💧 Liq: ${fmtUsd(snapshot.liquidityUsd)}\n⏳ Age: ${fmtAge(snapshot.ageMs)}\n🧩 Pairs seen: ${snapshot.pairCount}\n👥 Holders: ${snapshot.holders ?? '—'}${snapshot.verificationSource ? ` (${snapshot.verificationSource})` : ''}\n🏦 Top10: ${snapshot.top10Pct != null ? fmtPct(snapshot.top10Pct) : '—'}\n👀 Smart holders: ${snapshot.smartHolders ?? '—'}\n\nEvidence\n${snapshot.evidence.map((line) => `• ${line}`).join('\n')}\n\nVerdict\n${snapshot.verdict}\n\nPlatform note\n${snapshot.platformNote}\n\nLinks\n${snapshot.links}`;
}
