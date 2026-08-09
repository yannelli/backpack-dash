export interface SeededRng {
  readonly seed: string;
  next(): number;
  integer(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

export function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function createRng(seed: string): SeededRng {
  let state = hashSeed(seed) || 0x6d2b79f5;

  const next = (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };

  return {
    seed,
    next,
    integer(min: number, max: number): number {
      if (max < min) {
        throw new Error(`Invalid integer range: ${min}..${max}`);
      }
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new Error('Cannot pick from an empty collection');
      }
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}

export function seedFromUrl(url: string, fallback: () => string = () => `${Date.now()}`): string {
  const value = new URL(url).searchParams.get('seed')?.trim();
  return value || fallback();
}
