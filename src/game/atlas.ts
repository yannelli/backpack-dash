import Phaser from 'phaser';
import { PLAYER_SCALE } from './constants';

export const ATLAS_COLUMNS = 8;
export const ATLAS_ROWS = 11;
export const FRAME_WIDTH = 192;
export const FRAME_HEIGHT = 208;

export const ANIMATION_FRAMES = {
  idle: [0, 1, 2, 3, 4, 5],
  runningRight: [8, 9, 10, 11, 12, 13, 14, 15],
  runningLeft: [16, 17, 18, 19, 20, 21, 22, 23],
  waving: [24, 25, 26, 27],
  jumping: [32, 33, 34, 35, 36],
  failed: [40, 41, 42, 43, 44, 45, 46, 47],
  waiting: [48, 49, 50, 51, 52, 53],
  working: [56, 57, 58, 59, 60, 61],
  review: [64, 65, 66, 67, 68, 69],
  look: [72, 73, 74, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87],
} as const;

export interface RyanVisualCompensation {
  scale: number;
  y: number;
  angle: number;
}

export const DEFAULT_RYAN_VISUAL: RyanVisualCompensation = {
  scale: PLAYER_SCALE,
  y: 0,
  angle: 0,
};

// The approved pet atlas intentionally keeps its original in-cell jump motion.
// Gameplay supplies its own physics arc, so these render-only values normalize
// the five silhouettes to the running row without touching the source pixels or hitbox.
export const JUMP_VISUAL_COMPENSATION: Readonly<Record<number, RyanVisualCompensation>> = {
  32: { scale: 0.757, y: -20, angle: 0 },
  33: { scale: 0.752, y: -6, angle: -1 },
  34: { scale: 0.767, y: 21, angle: 0 },
  35: { scale: 0.713, y: -3, angle: 1 },
  36: { scale: 0.762, y: -21, angle: 0 },
};

export function jumpVisualForFrame(frame: number): RyanVisualCompensation {
  return JUMP_VISUAL_COMPENSATION[frame] ?? DEFAULT_RYAN_VISUAL;
}

function createAnimation(
  scene: Phaser.Scene,
  key: string,
  frames: readonly number[],
  frameRate: number,
  repeat: number,
): void {
  if (scene.anims.exists(key)) return;
  scene.anims.create({
    key,
    frames: frames.map((frame) => ({ key: 'mini-ryan', frame })),
    frameRate,
    repeat,
  });
}

export function registerRyanAnimations(scene: Phaser.Scene): void {
  createAnimation(scene, 'ryan-idle', ANIMATION_FRAMES.idle, 6, -1);
  createAnimation(scene, 'ryan-run-right', ANIMATION_FRAMES.runningRight, 12, -1);
  createAnimation(scene, 'ryan-run-left', ANIMATION_FRAMES.runningLeft, 12, -1);
  createAnimation(scene, 'ryan-wave', ANIMATION_FRAMES.waving, 7, -1);
  createAnimation(scene, 'ryan-jump', ANIMATION_FRAMES.jumping, 9, 0);
  createAnimation(scene, 'ryan-failed', ANIMATION_FRAMES.failed, 9, 0);
  createAnimation(scene, 'ryan-waiting', ANIMATION_FRAMES.waiting, 6, -1);
  createAnimation(scene, 'ryan-working', ANIMATION_FRAMES.working, 7, -1);
  createAnimation(scene, 'ryan-review', ANIMATION_FRAMES.review, 6, -1);
}

export function lookFrameForVector(dx: number, dy: number, deadzone = 44): number {
  if (Math.hypot(dx, dy) < deadzone) return ANIMATION_FRAMES.idle[0];
  const clockwiseFromUp = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const degrees = (clockwiseFromUp + 360) % 360;
  const directionIndex = Math.round(degrees / 22.5) % 16;
  return ANIMATION_FRAMES.look[directionIndex] as number;
}
