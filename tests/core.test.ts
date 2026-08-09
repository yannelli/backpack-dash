import { describe, expect, it } from 'vitest';
import {
  ANIMATION_FRAMES,
  DEFAULT_RYAN_VISUAL,
  JUMP_VISUAL_COMPENSATION,
  jumpVisualForFrame,
  lookFrameForVector,
} from '../src/game/atlas';
import { JumpController, estimateJumpEnvelope, selectJumpImpulse } from '../src/game/jump';
import { createRng, hashSeed, seedFromUrl } from '../src/game/rng';
import { calculateScore } from '../src/game/scoring';
import { commitRun, emptySave, loadSave, parseSave, saveMuted } from '../src/game/save';
import { nextThemeIndex } from '../src/game/themes';
import type { RunStats, StorageLike } from '../src/game/types';

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('score calculation', () => {
  it('combines distance, pixels, and clean-floor bonuses', () => {
    expect(calculateScore(2_499, 7, 2)).toBe(1_099);
  });

  it('clamps malformed negative inputs', () => {
    expect(calculateScore(-100, -2, -1)).toBe(0);
  });
});

describe('save data', () => {
  it('recovers from missing, malformed, and incompatible saves', () => {
    expect(parseSave(null)).toEqual(emptySave());
    expect(parseSave('{nope')).toEqual(emptySave());
    expect(parseSave(JSON.stringify({ version: 99 }))).toEqual(emptySave());
  });

  it('commits a best run and retains only five recent runs', () => {
    const storage = new MemoryStorage();
    let save = emptySave();
    for (let index = 0; index < 7; index += 1) {
      const stats: RunStats = {
        seed: `run-${index}`,
        distancePixels: 1_000 + index,
        lostPixels: index,
        cleanFloors: 0,
        floor: index + 1,
        score: 100 + index,
        startedAt: '2026-08-09T00:00:00.000Z',
      };
      save = commitRun(storage, save, stats, `2026-08-09T00:00:0${index}.000Z`).save;
    }
    expect(save.bestScore).toBe(106);
    expect(save.bestFloor).toBe(7);
    expect(save.recentRuns).toHaveLength(5);
    expect(save.recentRuns[0]?.seed).toBe('run-6');
    expect(loadSave(storage)).toEqual(save);
  });

  it('persists mute without dropping score history', () => {
    const storage = new MemoryStorage();
    const current = { ...emptySave(), bestScore: 999 };
    const updated = saveMuted(storage, current, true);
    expect(updated.muted).toBe(true);
    expect(loadSave(storage).bestScore).toBe(999);
  });
});

describe('seeded randomness', () => {
  it('is deterministic and seed-sensitive', () => {
    const first = createRng('ryan').next();
    expect(createRng('ryan').next()).toBe(first);
    expect(createRng('not-ryan').next()).not.toBe(first);
    expect(hashSeed('ryan')).toBe(hashSeed('ryan'));
  });

  it('reads explicit URL seeds and falls back cleanly', () => {
    expect(seedFromUrl('https://game.test/?seed=floor-404')).toBe('floor-404');
    expect(seedFromUrl('https://game.test/', () => 'fallback')).toBe('fallback');
  });
});

describe('jump timing', () => {
  it('consumes input inside coyote time', () => {
    const controller = new JumpController();
    controller.touchGround(1_000);
    controller.queue(1_075);
    expect(controller.consume(1_080)).toBe(true);
    expect(controller.consume(1_081)).toBe(false);
  });

  it('buffers input shortly before landing', () => {
    const controller = new JumpController();
    controller.queue(1_000);
    controller.touchGround(1_100);
    expect(controller.consume(1_110)).toBe(true);
  });

  it('produces a usable maximum-speed jump envelope', () => {
    const envelope = estimateJumpEnvelope(570);
    expect(envelope.flightSeconds).toBeCloseTo(0.775, 3);
    expect(envelope.apexHeight).toBeGreaterThan(115);
    expect(envelope.horizontalDistance).toBeGreaterThan(440);
  });

  it('makes a held jump higher than a released tap', () => {
    expect(selectJumpImpulse(true, false)).toBe(620);
    expect(selectJumpImpulse(false, true)).toBe(520);
  });
});

describe('atlas mapping', () => {
  it('maps every approved v2 row without using blank slots', () => {
    expect(ANIMATION_FRAMES.idle).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ANIMATION_FRAMES.runningRight).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(ANIMATION_FRAMES.failed).toEqual([40, 41, 42, 43, 44, 45, 46, 47]);
    expect(ANIMATION_FRAMES.look).toHaveLength(16);
  });

  it('maps pointer vectors clockwise from up', () => {
    expect(lookFrameForVector(0, -100)).toBe(72);
    expect(lookFrameForVector(100, 0)).toBe(76);
    expect(lookFrameForVector(0, 100)).toBe(80);
    expect(lookFrameForVector(-100, 0)).toBe(84);
    expect(lookFrameForVector(1, 1)).toBe(0);
  });

  it('normalizes every jump frame without changing the atlas mapping', () => {
    expect(Object.keys(JUMP_VISUAL_COMPENSATION).map(Number)).toEqual([...ANIMATION_FRAMES.jumping]);
    for (const frame of ANIMATION_FRAMES.jumping) {
      const visual = jumpVisualForFrame(frame);
      expect(visual.scale).toBeGreaterThan(DEFAULT_RYAN_VISUAL.scale);
      expect(Math.abs(visual.angle)).toBeLessThanOrEqual(1);
    }
    expect(jumpVisualForFrame(ANIMATION_FRAMES.idle[0])).toBe(DEFAULT_RYAN_VISUAL);
  });
});

describe('theme rotation', () => {
  it('never immediately repeats the current theme', () => {
    for (let current = 0; current < 4; current += 1) {
      for (const random of [0, 0.25, 0.5, 0.999]) {
        expect(nextThemeIndex(current, random)).not.toBe(current);
      }
    }
  });
});
