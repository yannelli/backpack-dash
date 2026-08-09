import { MAX_SPEED } from './constants';
import { estimateJumpEnvelope } from './jump';
import type { PatternChunk } from './types';

export const PATTERNS: readonly PatternChunk[] = [
  {
    id: 'hello-pixel',
    minFloor: 1,
    length: 230,
    hazards: [{ x: 104, kind: 'low' }],
    collectibles: [
      { x: 36, height: 44 },
      { x: 86, height: 84 },
      { x: 136, height: 102 },
      { x: 186, height: 68 },
    ],
  },
  {
    id: 'tall-order',
    minFloor: 1,
    length: 250,
    hazards: [{ x: 118, kind: 'tall' }],
    collectibles: [
      { x: 48, height: 52 },
      { x: 104, height: 112 },
      { x: 164, height: 126 },
      { x: 218, height: 60 },
    ],
  },
  {
    id: 'coffee-break',
    minFloor: 1,
    length: 265,
    hazards: [{ x: 128, kind: 'wide' }],
    collectibles: [
      { x: 54, height: 42 },
      { x: 108, height: 76 },
      { x: 162, height: 78 },
      { x: 216, height: 42 },
    ],
  },
  {
    id: 'double-booked',
    minFloor: 3,
    length: 300,
    hazards: [
      { x: 105, kind: 'low' },
      { x: 194, kind: 'low' },
    ],
    collectibles: [
      { x: 46, height: 48 },
      { x: 100, height: 98 },
      { x: 150, height: 126 },
      { x: 204, height: 98 },
      { x: 258, height: 48 },
    ],
  },
  {
    id: 'calendar-stack',
    minFloor: 3,
    length: 305,
    hazards: [
      { x: 112, kind: 'tall' },
      { x: 214, kind: 'low' },
    ],
    collectibles: [
      { x: 50, height: 56 },
      { x: 104, height: 124 },
      { x: 162, height: 140 },
      { x: 222, height: 102 },
      { x: 272, height: 52 },
    ],
  },
  {
    id: 'packet-loss',
    minFloor: 4,
    length: 320,
    hazards: [
      { x: 96, kind: 'wide' },
      { x: 224, kind: 'tall' },
    ],
    collectibles: [
      { x: 42, height: 42 },
      { x: 92, height: 84 },
      { x: 146, height: 128 },
      { x: 202, height: 138 },
      { x: 262, height: 86 },
    ],
  },
  {
    id: 'triple-escalation',
    minFloor: 6,
    length: 345,
    hazards: [
      { x: 82, kind: 'low' },
      { x: 170, kind: 'low' },
      { x: 258, kind: 'low' },
    ],
    collectibles: [
      { x: 38, height: 62 },
      { x: 92, height: 112 },
      { x: 146, height: 140 },
      { x: 204, height: 140 },
      { x: 272, height: 102 },
      { x: 318, height: 56 },
    ],
  },
  {
    id: 'clean-inbox',
    minFloor: 1,
    length: 285,
    hazards: [],
    collectibles: [
      { x: 38, height: 46 },
      { x: 88, height: 46 },
      { x: 138, height: 46 },
      { x: 188, height: 46 },
      { x: 238, height: 46 },
    ],
  },
];

export function patternsForFloor(floor: number): readonly PatternChunk[] {
  const safeFloor = Math.max(1, Math.floor(floor));
  return PATTERNS.filter((pattern) => pattern.minFloor <= safeFloor);
}

export interface PatternValidation {
  ok: boolean;
  errors: string[];
  maxJumpDistance: number;
}

export function validatePatternLibrary(
  patterns: readonly PatternChunk[] = PATTERNS,
): PatternValidation {
  const envelope = estimateJumpEnvelope(MAX_SPEED);
  const errors: string[] = [];

  for (const pattern of patterns) {
    if (pattern.length <= 0) errors.push(`${pattern.id}: length must be positive`);
    const ordered = [...pattern.hazards].sort((a, b) => a.x - b.x);
    const first = ordered[0];
    const last = ordered.at(-1);
    if (first && first.x < 50) errors.push(`${pattern.id}: insufficient run-up`);
    if (last && pattern.length - last.x < 50) errors.push(`${pattern.id}: insufficient landing space`);
    if (first && last) {
      const obstacleSpan = last.x - first.x + 80;
      if (obstacleSpan > envelope.horizontalDistance * 0.9) {
        errors.push(`${pattern.id}: obstacle span exceeds safe jump envelope`);
      }
    }
    for (const collectible of pattern.collectibles) {
      if (collectible.x < 0 || collectible.x > pattern.length) {
        errors.push(`${pattern.id}: collectible lies outside chunk`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    maxJumpDistance: envelope.horizontalDistance,
  };
}
