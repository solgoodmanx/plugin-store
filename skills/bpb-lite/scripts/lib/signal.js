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

export function buildHeadline(signal) {
  if (signal === 'EARLY') return '🟣 EARLY';
  if (signal === 'MOMENTUM') return '🟢 MOMENTUM';
  return '🔵 CONFIRMATION';
}
