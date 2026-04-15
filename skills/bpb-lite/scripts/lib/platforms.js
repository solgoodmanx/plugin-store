import { normalizeTextParts } from './utils.js';

const PLATFORM_RULES = [
  {
    platform: 'Pumpfun',
    confidence: 'Medium',
    note: 'Pair and venue metadata suggest Pumpfun launch context or routing.',
    matches: ['pumpfun', 'pump.fun'],
  },
  {
    platform: 'LaunchLab',
    confidence: 'Medium',
    note: 'Public pair metadata suggests LaunchLab involvement.',
    matches: ['launchlab'],
  },
  {
    platform: 'Bonk',
    confidence: 'Medium',
    note: 'Pair metadata suggests Bonk ecosystem launch or routing context.',
    matches: ['bonk'],
  },
  {
    platform: 'Bags',
    confidence: 'Medium',
    note: 'Market metadata suggests Bags context in the launch or routing path.',
    matches: ['bags'],
  },
  {
    platform: 'RISE',
    confidence: 'Medium',
    note: 'Public market metadata suggests RISE platform context.',
    matches: ['rise'],
  },
  {
    platform: 'Raydium',
    confidence: 'Medium',
    note: 'Pair metadata suggests Raydium as the active liquidity venue.',
    matches: ['raydium'],
  },
  {
    platform: 'Meteora',
    confidence: 'Medium',
    note: 'Pair metadata points to Meteora or DBC-style liquidity context, which may be venue rather than original launch source.',
    matches: ['meteora', 'damm', 'dbc'],
  },
];

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

  if (ca?.toLowerCase?.().endsWith('pump')) {
    return {
      platform: 'Pumpfun',
      note: 'Address and pair context are consistent with Pumpfun-style launch flow.',
      confidence: 'Medium',
    };
  }

  for (const rule of PLATFORM_RULES) {
    if (rule.matches.some((part) => baseText.includes(part))) {
      return {
        platform: rule.platform,
        note: rule.note,
        confidence: rule.confidence,
      };
    }
  }

  return {
    platform: 'Unresolved',
    note: 'Current public evidence does not yet cleanly resolve launch-source or venue context.',
    confidence: 'Low',
  };
}
