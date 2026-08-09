import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');

function allFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() && entry.name !== 'node_modules' ? allFiles(path) : [path];
  });
}

describe('package privacy and delivery', () => {
  it('ships the approved Mini Ryan atlas and never ships the private selfie', () => {
    expect(existsSync(resolve(root, 'public/assets/mini-ryan.webp'))).toBe(true);
    expect(allFiles(root).some((path) => path.endsWith('source-ryan.jpeg'))).toBe(false);
  });
});
