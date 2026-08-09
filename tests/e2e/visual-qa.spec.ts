import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

test('captures title and gameplay QA frames', async ({ page }, testInfo) => {
  const qaDirectory = resolve(process.cwd(), 'qa');
  await mkdir(qaDirectory, { recursive: true });
  await page.goto('/?seed=visual-proof');
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'title');
  await page.screenshot({ path: resolve(qaDirectory, `title-${testInfo.project.name}.png`), fullPage: true });

  await page.keyboard.press('Space');
  await page.waitForTimeout(900);
  await page.keyboard.down('Space');
  await page.waitForTimeout(210);
  await page.keyboard.up('Space');
  await page.waitForTimeout(130);
  await expect(page.locator('body')).toHaveAttribute('data-game-phase', 'running');
  await page.screenshot({ path: resolve(qaDirectory, `gameplay-${testInfo.project.name}.png`), fullPage: true });
});
