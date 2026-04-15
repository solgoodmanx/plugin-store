import fs from 'fs';
import os from 'os';
import path from 'path';

export const GLOBAL_ENV_PATH = path.join(os.homedir(), '.config', 'env', 'global.env');

export function loadEnvFile(filePath = GLOBAL_ENV_PATH) {
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

export function isLikelySolanaAddress(value) {
  return typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function fmtUsd(n) {
  const value = Number(n ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '$0';
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function fmtPct(n, digits = 1) {
  const value = Number(n);
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

export function fmtAge(ms) {
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

export function chooseBestPair(pairs = []) {
  return [...pairs].sort((a, b) => {
    const liqA = Number(a?.liquidity?.usd ?? 0);
    const liqB = Number(b?.liquidity?.usd ?? 0);
    const volA = Number(a?.volume?.h24 ?? 0);
    const volB = Number(b?.volume?.h24 ?? 0);
    return (liqB - liqA) || (volB - volA);
  })[0] ?? null;
}

export function normalizeTextParts(parts = []) {
  return parts
    .flatMap((part) => Array.isArray(part) ? part : [part])
    .map((part) => String(part ?? '').toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export function coalesceNumber(...values) {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return num;
  }
  return null;
}

export function pickText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}
