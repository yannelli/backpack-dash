import { expect, test } from '@playwright/test';

test('animates Mini Ryan and previews music without leaving the title', async ({ page }) => {
  await page.goto('/?seed=animated-title');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-game-phase', 'title');
  await expect(body).toHaveAttribute('data-menu-animation', /ryan-review|ryan-waiting|ryan-working|ryan-idle/);
  await expect(body).not.toHaveAttribute('data-menu-animation', 'ryan-wave');
  await expect(body).toHaveAttribute('data-menu-animation-rate', '0.2');

  const canvas = page.locator('canvas');
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({
    position: {
      x: (744 / 960) * (bounds?.width ?? 960),
      y: (477 / 540) * (bounds?.height ?? 540),
    },
  });

  await expect(body).toHaveAttribute('data-title-music', 'playing');
  await expect(body).toHaveAttribute('data-game-phase', 'title');
});

test.beforeEach(async ({ page }) => {
  await page.goto('/?seed=e2e-floor-404');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'title');
  await expect(page.locator('canvas')).toBeVisible();
});

test('starts, jumps, pauses, resumes, and persists mute', async ({ page }) => {
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  await expect(page.locator('body')).toHaveAttribute('data-seed', 'e2e-floor-404');

  await page.keyboard.down('Space');
  await page.waitForTimeout(90);
  await page.keyboard.up('Space');
  await page.keyboard.press('p');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'paused');
  await page.keyboard.press('Escape');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');

  await page.keyboard.press('m');
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('mini-ryan-backpack-dash:v1') ?? '{}'),
  );
  expect(saved.muted).toBe(true);
});

test('supports pointer controls and makes progress without network calls', async ({ page, context }, testInfo) => {
  const canvas = page.locator('canvas');
  if (testInfo.project.name === 'mobile-chrome') {
    await canvas.tap();
  } else {
    await canvas.click();
  }
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  await context.setOffline(true);
  if (testInfo.project.name === 'mobile-chrome') {
    await canvas.tap();
  } else {
    await page.mouse.down();
    await page.waitForTimeout(120);
    await page.mouse.up();
  }
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-score'))).toBeGreaterThan(0);
});

test('shows game over and retries without a reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Long collision flow only needs one browser profile.');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'gameOver', { timeout: 15_000 });
  await page.waitForTimeout(750);
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  await expect(page.locator('body')).toHaveAttribute('data-floor', '1');
});

test('survives a generated floor and completes an elevator transition', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome', 'Hazard-aware full-floor run only needs one browser profile.');
  test.setTimeout(40_000);
  await page.keyboard.press('Space');
  let lastJumpedHazard = '';
  const deadline = Date.now() + 35_000;

  while (Date.now() < deadline) {
    const body = page.locator('body');
    const phase = await body.getAttribute('data-game-phase');
    const floor = Number(await body.getAttribute('data-floor'));
    if (floor >= 2) break;
    expect(phase).not.toBe('gameOver');
    const hazardX = Number(await body.getAttribute('data-next-hazard-x'));
    const hazardId = (await body.getAttribute('data-next-hazard-distance')) ?? '';
    if (phase === 'running' && hazardId && hazardId !== lastJumpedHazard && hazardX > 270 && hazardX < 350) {
      lastJumpedHazard = hazardId;
      await page.keyboard.down('Space');
      await page.waitForTimeout(210);
      await page.keyboard.up('Space');
    }
    await page.waitForTimeout(45);
  }

  await expect(page.locator('body')).toHaveAttribute('data-floor', '2');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', /running|elevator/);
  await expect(page.locator('body')).toHaveAttribute(
    'data-elevator-sound-sequence',
    /entry>travel>exit/,
  );
});

test('fits the canvas inside desktop and mobile viewports', async ({ page }) => {
  const box = await page.locator('canvas').boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect((box?.width ?? Infinity) <= (viewport?.width ?? 0)).toBe(true);
  expect((box?.height ?? Infinity) <= (viewport?.height ?? 0)).toBe(true);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(16 / 9, 1);
});

test('detects reduced motion before gameplay starts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'title');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
});
