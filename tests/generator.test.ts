import { describe, expect, it } from 'vitest';
import { MAX_SPEED, TARGET_FLOOR_SECONDS } from '../src/game/constants';
import {
  DIFFICULTY_BANDS,
  difficultyForFloor,
  floorLengthForFloor,
  generateFloorLayout,
  speedForFloor,
} from '../src/game/generator';
import { estimateJumpEnvelope } from '../src/game/jump';
import { PATTERNS, validatePatternLibrary } from '../src/game/patterns';
import { createRng } from '../src/game/rng';

describe('difficulty progression', () => {
  it('uses the expected three bands and caps speed', () => {
    expect(DIFFICULTY_BANDS).toHaveLength(3);
    expect(difficultyForFloor(1).minFloor).toBe(1);
    expect(difficultyForFloor(4).minFloor).toBe(3);
    expect(difficultyForFloor(60).minFloor).toBe(6);
    expect(speedForFloor(1)).toBe(300);
    expect(speedForFloor(60)).toBe(MAX_SPEED);
  });

  it('keeps floors near the target duration as speed increases', () => {
    for (const floor of [1, 2, 6, 16, 60]) {
      expect(floorLengthForFloor(floor) / speedForFloor(floor)).toBeCloseTo(TARGET_FLOOR_SECONDS, 2);
    }
    expect(floorLengthForFloor(1)).toBe(8_400);
    expect(floorLengthForFloor(60)).toBe(15_960);
  });
});

describe('pattern safety', () => {
  it('keeps every handcrafted chunk inside the maximum jump envelope', () => {
    const validation = validatePatternLibrary();
    expect(validation.errors).toEqual([]);
    expect(validation.maxJumpDistance).toBeCloseTo(441.75, 2);
  });

  it('simulates 1,000 seeds in every difficulty band without invalid layouts', () => {
    const sampleFloors = [1, 3, 6];
    const maxJumpDistance = estimateJumpEnvelope(MAX_SPEED).horizontalDistance;
    const patternMap = new Map(PATTERNS.map((pattern) => [pattern.id, pattern]));

    for (const floor of sampleFloors) {
      for (let index = 0; index < 1_000; index += 1) {
        const layout = generateFloorLayout(floor, createRng(`floor-${floor}-seed-${index}`));
        expect(layout.chunks.length).toBeGreaterThan(0);
        expect(layout.collectibles.length).toBeGreaterThan(0);
        expect(layout.chunks[0]?.start).toBeGreaterThanOrEqual(500);
        expect(layout.chunks.at(-1)?.end).toBeLessThanOrEqual(floorLengthForFloor(floor) - 350);

        for (let chunkIndex = 0; chunkIndex < layout.chunks.length; chunkIndex += 1) {
          const chunk = layout.chunks[chunkIndex];
          if (!chunk) continue;
          const source = patternMap.get(chunk.patternId);
          expect(source).toBeDefined();
          const hazards = layout.hazards.filter((hazard) => hazard.patternId === chunk.patternId && hazard.offset >= chunk.start && hazard.offset <= chunk.end);
          if (hazards.length > 1) {
            const span = (hazards.at(-1)?.offset ?? 0) - (hazards[0]?.offset ?? 0) + 80;
            expect(span).toBeLessThan(maxJumpDistance * 0.9);
          }
          const next = layout.chunks[chunkIndex + 1];
          if (next) expect(next.start - chunk.end).toBeGreaterThanOrEqual(290);
        }
      }
    }
  }, 30_000);

  it('returns identical layouts for identical seeds', () => {
    const first = generateFloorLayout(8, createRng('same-seed'));
    const second = generateFloorLayout(8, createRng('same-seed'));
    expect(second).toEqual(first);
  });
});
