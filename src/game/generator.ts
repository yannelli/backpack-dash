import { MAX_SPEED, SPEED_PER_FLOOR, START_SPEED, TARGET_FLOOR_SECONDS } from './constants';
import { patternsForFloor } from './patterns';
import type { SeededRng } from './rng';
import type { DifficultyBand, HazardKind } from './types';

export interface GeneratedHazard {
  offset: number;
  kind: HazardKind;
  patternId: string;
}

export interface GeneratedCollectible {
  offset: number;
  height: number;
  patternId: string;
}

export interface GeneratedChunk {
  patternId: string;
  start: number;
  end: number;
}

export interface GeneratedFloor {
  floor: number;
  hazards: GeneratedHazard[];
  collectibles: GeneratedCollectible[];
  chunks: GeneratedChunk[];
}

export const DIFFICULTY_BANDS: readonly DifficultyBand[] = [
  {
    minFloor: 1,
    maxFloor: 2,
    speed: START_SPEED,
    patternIds: ['hello-pixel', 'tall-order', 'coffee-break', 'clean-inbox'],
  },
  {
    minFloor: 3,
    maxFloor: 5,
    speed: START_SPEED + SPEED_PER_FLOOR * 2,
    patternIds: [
      'hello-pixel',
      'tall-order',
      'coffee-break',
      'double-booked',
      'calendar-stack',
      'packet-loss',
      'clean-inbox',
    ],
  },
  {
    minFloor: 6,
    maxFloor: Number.POSITIVE_INFINITY,
    speed: Math.min(MAX_SPEED, START_SPEED + SPEED_PER_FLOOR * 5),
    patternIds: [
      'hello-pixel',
      'tall-order',
      'coffee-break',
      'double-booked',
      'calendar-stack',
      'packet-loss',
      'triple-escalation',
      'clean-inbox',
    ],
  },
];

export function speedForFloor(floor: number): number {
  return Math.min(MAX_SPEED, START_SPEED + Math.max(0, Math.floor(floor) - 1) * SPEED_PER_FLOOR);
}

export function floorLengthForFloor(floor: number): number {
  return Math.round(speedForFloor(floor) * TARGET_FLOOR_SECONDS);
}

export function difficultyForFloor(floor: number): DifficultyBand {
  const safeFloor = Math.max(1, Math.floor(floor));
  return (
    DIFFICULTY_BANDS.find((band) => safeFloor >= band.minFloor && safeFloor <= band.maxFloor) ??
    (DIFFICULTY_BANDS.at(-1) as DifficultyBand)
  );
}

export function generateFloorLayout(
  floor: number,
  rng: SeededRng,
  floorLength = floorLengthForFloor(floor),
): GeneratedFloor {
  const safeFloor = Math.max(1, Math.floor(floor));
  const allowedIds = new Set(difficultyForFloor(safeFloor).patternIds);
  const available = patternsForFloor(safeFloor).filter((pattern) => allowedIds.has(pattern.id));
  const result: GeneratedFloor = {
    floor: safeFloor,
    hazards: [],
    collectibles: [],
    chunks: [],
  };
  let cursor = 500;
  const end = floorLength - 350;

  while (cursor < end) {
    const pattern = rng.pick(available);
    if (cursor + pattern.length > end) break;
    result.chunks.push({ patternId: pattern.id, start: cursor, end: cursor + pattern.length });
    for (const hazard of pattern.hazards) {
      result.hazards.push({ offset: cursor + hazard.x, kind: hazard.kind, patternId: pattern.id });
    }
    for (const collectible of pattern.collectibles) {
      result.collectibles.push({
        offset: cursor + collectible.x,
        height: collectible.height,
        patternId: pattern.id,
      });
    }
    const minimumGap = Math.max(290, 425 - safeFloor * 8);
    cursor += pattern.length + rng.integer(minimumGap, minimumGap + 135);
  }
  return result;
}
