import { afterEach, describe, expect, test, vi } from 'vitest';

describe('Playwright server configuration', () => {
  afterEach(() => {
    delete process.env.E2E_PORT;
    vi.resetModules();
  });

  test('uses an isolated E2E port without reusing another workspace server', async () => {
    process.env.E2E_PORT = '43127';

    const { default: config } = await import('../playwright.config');

    expect(config.use?.baseURL).toBe('http://127.0.0.1:43127');
    expect(config.webServer).toMatchObject({
      command: 'pnpm preview --port 43127 --strictPort',
      url: 'http://127.0.0.1:43127',
      reuseExistingServer: false,
    });
  });
});
