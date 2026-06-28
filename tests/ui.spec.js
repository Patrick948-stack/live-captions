// E2E tests for Live Captions UI
// Run with: playwright test

const { test, expect } = require('@playwright/test');

// Lightweight mock replacing the 145 MB Whisper CDN bundle.
// Returns a pipeline function that immediately resolves with a canned transcript.
const MOCK_TRANSFORMERS = `
  export const env = { allowLocalModels: false };
  export async function pipeline(task, model, opts = {}) {
    if (opts.progress_callback) {
      opts.progress_callback({ status: 'progress', file: 'model.onnx', progress: 50 });
      opts.progress_callback({ status: 'ready' });
    }
    return async () => ({
      text: ' The quick brown fox jumps over the lazy dog.',
      language: 'english'
    });
  }
`;

test.describe('Live Captions', () => {
  test.beforeEach(async ({ page }) => {
    // Return the mock module for any request to the transformers CDN
    await page.route(/transformers/, route =>
      route.fulfill({ contentType: 'application/javascript; charset=utf-8', body: MOCK_TRANSFORMERS })
    );

    // Stub browser APIs that are unavailable or undesirable in test context
    await page.addInitScript(() => {
      // Prevent the COI service worker from registering and reloading the page
      try {
        Object.defineProperty(window, 'crossOriginIsolated', { get: () => true, configurable: true });
      } catch {}

      // Mock getUserMedia — return a silent stream
      const mockTrack = { stop: () => {} };
      const mockStream = { getTracks: () => [mockTrack], getAudioTracks: () => [mockTrack] };
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.resolve(mockStream) }
      });

      // Mock AudioContext — fires onaudioprocess once with enough samples
      // to trigger processChunk (nativeSR * CHUNK_SEC = 44100 * 5 = 220500)
      window.AudioContext = class {
        get sampleRate() { return 44100; }
        createMediaStreamSource() { return { connect: () => {} }; }
        createScriptProcessor() {
          const proc = { connect: () => {}, disconnect: () => {} };
          setTimeout(() => {
            if (typeof proc.onaudioprocess === 'function') {
              const buf = new Float32Array(220500 + 4096).fill(0.1);
              proc.onaudioprocess({ inputBuffer: { getChannelData: () => buf } });
            }
          }, 150);
          return proc;
        }
        close() {}
      };

      // Mock Wake Lock API
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: { request: () => Promise.resolve({ release: () => {} }) }
      });
    });

    await page.goto('/');
  });

  // ── Page structure ──────────────────────────────────────────────────────────

  test('has the correct page title', async ({ page }) => {
    await expect(page).toHaveTitle('Live Captions');
  });

  test('Start button is visible and labelled Start on load', async ({ page }) => {
    await expect(page.locator('#btn-start')).toBeVisible();
    await expect(page.locator('#btn-start')).toHaveText('Start');
  });

  test('Clear button is visible on load', async ({ page }) => {
    await expect(page.locator('#btn-clear')).toBeVisible();
    await expect(page.locator('#btn-clear')).toHaveText('Clear');
  });

  test('font size buttons A+ and A− are visible', async ({ page }) => {
    await expect(page.locator('#btn-lg')).toBeVisible();
    await expect(page.locator('#btn-sm')).toBeVisible();
  });

  test('ghost placeholder text is visible before any captions', async ({ page }) => {
    await expect(page.locator('#ghost')).toBeVisible();
  });

  test('initial status text reads Ready · point mic at TV', async ({ page }) => {
    await expect(page.locator('#status-text')).toHaveText('Ready · point mic at TV');
  });

  test('language badge is not shown on load', async ({ page }) => {
    await expect(page.locator('#lang-tag')).not.toHaveClass(/show/);
  });

  test('loader overlay is hidden on initial page load', async ({ page }) => {
    await expect(page.locator('#loader')).toHaveClass(/hidden/);
  });

  test('status dot has no active class on load', async ({ page }) => {
    const dot = page.locator('#dot');
    await expect(dot).not.toHaveClass(/on/);
    await expect(dot).not.toHaveClass(/proc/);
  });

  // ── Font size controls ──────────────────────────────────────────────────────

  test('A+ increases the caption font size by 2px', async ({ page }) => {
    const before = await page.evaluate(() =>
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'))
    );
    await page.locator('#btn-lg').click();
    const after = await page.evaluate(() =>
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'))
    );
    expect(after).toBe(before + 2);
  });

  test('A− decreases the caption font size by 2px', async ({ page }) => {
    const before = await page.evaluate(() =>
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'))
    );
    await page.locator('#btn-sm').click();
    const after = await page.evaluate(() =>
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'))
    );
    expect(after).toBe(before - 2);
  });

  test('font size cannot exceed the maximum of 44px', async ({ page }) => {
    for (let i = 0; i < 25; i++) await page.locator('#btn-lg').click();
    const fs = await page.evaluate(() =>
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'))
    );
    expect(fs).toBeLessThanOrEqual(44);
  });

  test('font size cannot go below the minimum of 14px', async ({ page }) => {
    for (let i = 0; i < 25; i++) await page.locator('#btn-sm').click();
    const fs = await page.evaluate(() =>
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--fs'))
    );
    expect(fs).toBeGreaterThanOrEqual(14);
  });

  // ── Start / Stop flow ───────────────────────────────────────────────────────

  test('Start button changes to Stop when listening begins', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#btn-start')).toHaveText('Stop', { timeout: 5000 });
  });

  test('Start button gets the stop (red) class when active', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#btn-start')).toHaveClass(/stop/, { timeout: 5000 });
  });

  test('status dot gets the on class while listening', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#dot')).toHaveClass(/on/, { timeout: 5000 });
  });

  test('status text changes to Listening while active', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#status-text')).toHaveText('Listening…', { timeout: 5000 });
  });

  test('ghost placeholder hides once listening starts', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#btn-start')).toHaveText('Stop', { timeout: 5000 });
    await expect(page.locator('#ghost')).toBeHidden();
  });

  test('Stop button returns UI to initial idle state', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#btn-start')).toHaveText('Stop', { timeout: 5000 });
    await page.locator('#btn-start').click();
    await expect(page.locator('#btn-start')).toHaveText('Start');
    await expect(page.locator('#btn-start')).not.toHaveClass(/stop/);
    await expect(page.locator('#status-text')).toHaveText('Ready · point mic at TV');
  });

  // ── Transcription pipeline ──────────────────────────────────────────────────

  test('caption text appears after audio chunk is processed', async ({ page }) => {
    await page.locator('#btn-start').click();
    // The mock AudioContext fires onaudioprocess after 150 ms,
    // which triggers processChunk → mock Whisper → appends text.
    await expect(page.locator('#final')).toContainText('The quick brown fox', { timeout: 8000 });
  });

  test('detected language badge becomes visible after transcription', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#final')).toContainText('quick brown fox', { timeout: 8000 });
    await expect(page.locator('#lang-tag')).toHaveClass(/show/);
    await expect(page.locator('#lang-tag')).toHaveText('ENGLISH');
  });

  // ── Clear button ─────────────────────────────────────────────────────────────

  test('Clear button wipes transcript and restores ghost text', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#final')).toContainText('quick brown fox', { timeout: 8000 });
    await page.locator('#btn-clear').click();
    await expect(page.locator('#final')).toHaveText('');
    await expect(page.locator('#ghost')).toBeVisible();
  });

  test('Clear button hides the language badge', async ({ page }) => {
    await page.locator('#btn-start').click();
    await expect(page.locator('#lang-tag')).toHaveClass(/show/, { timeout: 8000 });
    await page.locator('#btn-clear').click();
    await expect(page.locator('#lang-tag')).not.toHaveClass(/show/);
  });
});
