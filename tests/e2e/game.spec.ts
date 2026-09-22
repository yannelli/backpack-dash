import { expect, test } from '@playwright/test';

test('animates Mini Ryan and previews music without leaving the title', async ({ page }) => {
  await page.goto('/?seed=animated-title');
  const body = page.locator('body');
  await expect(body).toHaveAttribute('data-game-phase', 'title');
  await expect(body).toHaveAttribute('data-menu-animation', /ryan-review|ryan-waiting|ryan-working|ryan-idle/);
  await expect(body).not.toHaveAttribute('data-menu-animation', 'ryan-wave');
  await expect(body).toHaveAttribute('data-menu-animation-rate', '0.2');

  await page.getByRole('button', { name: 'Preview the soundtrack' }).click();

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
  test.setTimeout(55_000);
  await page.goto('/?seed=e2e-floor-404&qaAutoJump=1');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'title');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  const outcome = await page.waitForFunction(
    () => {
      const phase = document.body.dataset.gamePhase;
      if (phase === 'gameOver') return 'crashed';
      if (document.body.dataset.floor === '2') return 'cleared';
      return false;
    },
    { timeout: 50_000 },
  );
  expect(await outcome.jsonValue(), 'should clear floor 1 without colliding').toBe('cleared');
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
  const portrait = await page.evaluate(() => matchMedia('(max-width: 700px) and (orientation: portrait)').matches);
  expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(portrait ? 640 / 540 : 16 / 9, 1);
});

test('operates the visible controls and returns to the lobby', async ({ page }) => {
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  const jump = page.getByRole('button', { name: 'JUMP HOLD FOR HEIGHT' });
  await expect(jump).toBeEnabled();
  await expect(jump).toBeInViewport();
  const bounds = await jump.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await page.mouse.down();
  await expect(jump).toHaveClass(/is-held/);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  await expect(jump).not.toHaveClass(/is-held/);

  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'On a break.' })).toBeVisible();
  const pausedScore = await page.locator('#score').textContent();
  await page.waitForTimeout(200);
  await expect(page.locator('#score')).toHaveText(pausedScore!);
  await expect(jump).toBeDisabled();
  await page.getByRole('button', { name: 'Keep going' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  await page.getByRole('button', { name: 'Pause game', exact: true }).click();
  await page.getByRole('button', { name: 'Back to lobby' }).filter({ visible: true }).click();
  await expect(page.getByRole('button', { name: 'Clock in' })).toBeVisible();
  await page.getByRole('button', { name: 'Mute sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Unmute sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('keeps mobile controls usable after rotation and touch cancellation', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Touch and orientation coverage.');
  await page.goto('/?seed=mobile-controls&qaNoCollision=1');
  await page.getByRole('button', { name: 'Clock in' }).tap();
  const jump = page.locator('#jump-button');
  const box = await jump.boundingBox();
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }],
  });
  await expect(jump).toHaveClass(/is-held/);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(jump).not.toHaveClass(/is-held/);
  await jump.tap();
  await expect.poll(async () => Number(await page.locator('#floor-progress').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  const score = Number(await page.locator('body').getAttribute('data-score'));
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(jump).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Pause game', exact: true })).toBeInViewport();
  await expect.poll(async () => (await page.locator('canvas').boundingBox())!.width / (await page.locator('canvas').boundingBox())!.height).toBeCloseTo(16 / 9, 1);
  await jump.tap();
  await expect.poll(async () => Number(await page.locator('body').getAttribute('data-score'))).toBeGreaterThan(score);
  await page.setViewportSize({ width: 320, height: 568 });
  await expect(jump).toBeInViewport();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await session.detach();
});

test('shows readable results and retries using touch', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome', 'Mobile result controls.');
  await page.getByRole('button', { name: 'Clock in' }).tap();
  const retry = page.getByRole('button', { name: 'Run it back' });
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await expect(retry).toBeInViewport();
  await expect(page.locator('#result-score')).not.toHaveText('000000');
  await retry.tap();
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  await expect(page.locator('#floor')).toHaveText('001');
});

test('detects reduced motion before gameplay starts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'title');
  await page.keyboard.press('Space');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
});
