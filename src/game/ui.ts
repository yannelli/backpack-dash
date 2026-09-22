import type { GamePhase } from './types';

export interface GameUiState {
  phase: GamePhase;
  score: number;
  bestScore: number;
  floor: number;
  bestFloor: number;
  pixels: number;
  distance: number;
  cleanFloors: number;
  theme: string;
  themeId: string;
  progress: number;
  muted: boolean;
  isNewBest: boolean;
  resultsReady: boolean;
}

export type GameUiAction = 'down' | 'up' | 'pause' | 'mute' | 'music' | 'home';
