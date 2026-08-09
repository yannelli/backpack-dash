import { SAVE_KEY, SAVE_VERSION } from './constants';
import type { RecentRun, RunStats, SaveDataV1, StorageLike } from './types';

export function emptySave(): SaveDataV1 {
  return {
    version: SAVE_VERSION,
    bestScore: 0,
    bestDistance: 0,
    bestFloor: 0,
    muted: false,
    recentRuns: [],
  };
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRecentRun(value: unknown): value is RecentRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<RecentRun>;
  return (
    isFiniteNonNegative(run.score) &&
    isFiniteNonNegative(run.distancePixels) &&
    isFiniteNonNegative(run.floor) &&
    isFiniteNonNegative(run.lostPixels) &&
    isFiniteNonNegative(run.cleanFloors) &&
    typeof run.seed === 'string' &&
    typeof run.completedAt === 'string'
  );
}

export function parseSave(raw: string | null): SaveDataV1 {
  if (!raw) return emptySave();
  try {
    const value = JSON.parse(raw) as Partial<SaveDataV1>;
    if (
      value.version !== SAVE_VERSION ||
      !isFiniteNonNegative(value.bestScore) ||
      !isFiniteNonNegative(value.bestDistance) ||
      !isFiniteNonNegative(value.bestFloor) ||
      typeof value.muted !== 'boolean' ||
      !Array.isArray(value.recentRuns)
    ) {
      return emptySave();
    }
    return {
      version: SAVE_VERSION,
      bestScore: Math.floor(value.bestScore),
      bestDistance: Math.floor(value.bestDistance),
      bestFloor: Math.floor(value.bestFloor),
      muted: value.muted,
      recentRuns: value.recentRuns.filter(isRecentRun).slice(0, 5),
    };
  } catch {
    return emptySave();
  }
}

export function loadSave(storage: StorageLike): SaveDataV1 {
  return parseSave(storage.getItem(SAVE_KEY));
}

export function writeSave(storage: StorageLike, data: SaveDataV1): SaveDataV1 {
  storage.setItem(SAVE_KEY, JSON.stringify(data));
  return data;
}

export function commitRun(
  storage: StorageLike,
  current: SaveDataV1,
  stats: RunStats,
  completedAt = new Date().toISOString(),
): { save: SaveDataV1; isNewBest: boolean } {
  const run: RecentRun = {
    score: stats.score,
    distancePixels: Math.floor(stats.distancePixels),
    floor: stats.floor,
    lostPixels: stats.lostPixels,
    cleanFloors: stats.cleanFloors,
    seed: stats.seed,
    completedAt,
  };
  const isNewBest = stats.score > current.bestScore;
  const save: SaveDataV1 = {
    ...current,
    bestScore: Math.max(current.bestScore, stats.score),
    bestDistance: Math.max(current.bestDistance, Math.floor(stats.distancePixels)),
    bestFloor: Math.max(current.bestFloor, stats.floor),
    recentRuns: [run, ...current.recentRuns].slice(0, 5),
  };
  writeSave(storage, save);
  return { save, isNewBest };
}

export function saveMuted(
  storage: StorageLike,
  current: SaveDataV1,
  muted: boolean,
): SaveDataV1 {
  return writeSave(storage, { ...current, muted });
}
