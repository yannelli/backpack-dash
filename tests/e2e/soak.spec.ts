import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('five-minute run keeps gameplay and pooled entities stable', async ({ page }) => {
  test.skip(process.env.SOAK !== '1', 'Run explicitly with pnpm test:soak.');
  test.setTimeout(330_000);
  await page.goto('/?seed=five-minute-soak&qaNoCollision=1');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'title');
  await page.keyboard.press('Space');

  const started = Date.now();
  let maxHazards = 0;
  let maxCollectibles = 0;

  while (Date.now() - started < 300_000) {
    const body = page.locator('body');
    const phase = await body.getAttribute('data-game-phase');
    expect(phase).not.toBe('gameOver');
    maxHazards = Math.max(maxHazards, Number(await body.getAttribute('data-active-hazards')) || 0);
    maxCollectibles = Math.max(
      maxCollectibles,
      Number(await body.getAttribute('data-active-collectibles')) || 0,
    );

    await page.waitForTimeout(500);
  }

  expect(maxHazards).toBeLessThanOrEqual(128);
  expect(maxCollectibles).toBeLessThanOrEqual(256);
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', /running|elevator/);
  expect(Number(await page.locator('body').getAttribute('data-floor'))).toBeGreaterThan(9);

  const sampledFrames = await page.evaluate(
    () =>
      new Promise<number>((resolveFrames) => {
        let frames = 0;
        const start = performance.now();
        const tick = (now: number): void => {
          frames += 1;
          if (now - start >= 1_000) resolveFrames(frames);
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
  expect(sampledFrames).toBeGreaterThanOrEqual(45);
  const qaDirectory = resolve(process.cwd(), 'qa');
  await mkdir(qaDirectory, { recursive: true });
  await page.screenshot({ path: resolve(qaDirectory, 'soak-five-minutes.png'), fullPage: true });
});
