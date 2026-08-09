export type GamePhase = 'boot' | 'title' | 'running' | 'elevator' | 'paused' | 'gameOver';

export type ThemeId = 'office' | 'rooftop' | 'subway' | 'server';
export type HazardKind = 'low' | 'tall' | 'wide';

export interface HazardDefinition {
  x: number;
  kind: HazardKind;
}

export interface CollectibleDefinition {
  x: number;
  height: number;
}

export interface PatternChunk {
  id: string;
  minFloor: number;
  length: number;
  hazards: HazardDefinition[];
  collectibles: CollectibleDefinition[];
}

export interface DifficultyBand {
  minFloor: number;
  maxFloor: number;
  speed: number;
  patternIds: string[];
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  kicker: string;
  backgroundKey: string;
  parallaxKey: string;
  groundKey: string;
  accent: number;
  accentCss: string;
  hazardKeys: Record<HazardKind, string>;
  musicScale: number[];
}

export interface RunStats {
  seed: string;
  distancePixels: number;
  lostPixels: number;
  cleanFloors: number;
  floor: number;
  score: number;
  startedAt: string;
}

export interface RecentRun {
  score: number;
  distancePixels: number;
  floor: number;
  lostPixels: number;
  cleanFloors: number;
  seed: string;
  completedAt: string;
}

export interface SaveDataV1 {
  version: 1;
  bestScore: number;
  bestDistance: number;
  bestFloor: number;
  muted: boolean;
  recentRuns: RecentRun[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
