import type { RunStats } from './types';

export function calculateScore(
  distancePixels: number,
  lostPixels: number,
  cleanFloors: number,
): number {
  const safeDistance = Math.max(0, Math.floor(distancePixels));
  const safePixels = Math.max(0, Math.floor(lostPixels));
  const safeFloors = Math.max(0, Math.floor(cleanFloors));
  return Math.floor(safeDistance / 10) + safePixels * 50 + safeFloors * 250;
}

export function updateRunScore(stats: RunStats): RunStats {
  return {
    ...stats,
    score: calculateScore(stats.distancePixels, stats.lostPixels, stats.cleanFloors),
  };
}
