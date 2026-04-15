import crypto from 'crypto';
import { chooseBestPair } from './utils.js';

export const OKX_BASE_URL = 'https://web3.okx.com';
export const SOLANA_CHAIN_INDEX = '501';

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

export async function fetchOkxSnapshot(ca) {
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

export async function fetchDexScreener(ca) {
  const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
  if (!res.ok) throw new Error(`DexScreener request failed: ${res.status}`);
  const json = await res.json();
  const pairs = Array.isArray(json?.pairs) ? json.pairs : [];
  return { pairs, bestPair: chooseBestPair(pairs) };
}

function toPrintrCaip10(ca) {
  return `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:${ca}`;
}

export async function fetchPrintrMetadata(ca) {
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

export async function fetchHeliusHolderCount(ca) {
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
