import {
  COYOTE_MS,
  GRAVITY,
  JUMP_BUFFER_MS,
  JUMP_IMPULSE,
  SHORT_JUMP_IMPULSE,
} from './constants';

export class JumpController {
  private coyoteUntil = Number.NEGATIVE_INFINITY;
  private bufferedUntil = Number.NEGATIVE_INFINITY;

  touchGround(now: number): void {
    this.coyoteUntil = now + COYOTE_MS;
  }

  queue(now: number): void {
    this.bufferedUntil = now + JUMP_BUFFER_MS;
  }

  consume(now: number): boolean {
    if (now <= this.bufferedUntil && now <= this.coyoteUntil) {
      this.bufferedUntil = Number.NEGATIVE_INFINITY;
      this.coyoteUntil = Number.NEGATIVE_INFINITY;
      return true;
    }
    return false;
  }

  clear(): void {
    this.coyoteUntil = Number.NEGATIVE_INFINITY;
    this.bufferedUntil = Number.NEGATIVE_INFINITY;
  }
}

export interface JumpEnvelope {
  flightSeconds: number;
  apexHeight: number;
  horizontalDistance: number;
}

export function estimateJumpEnvelope(
  speed: number,
  gravity = GRAVITY,
  impulse = JUMP_IMPULSE,
): JumpEnvelope {
  const flightSeconds = (2 * impulse) / gravity;
  return {
    flightSeconds,
    apexHeight: (impulse * impulse) / (2 * gravity),
    horizontalDistance: speed * flightSeconds,
  };
}

export function selectJumpImpulse(actionHeld: boolean, releasedBeforeLaunch: boolean): number {
  return actionHeld && !releasedBeforeLaunch ? JUMP_IMPULSE : SHORT_JUMP_IMPULSE;
}
