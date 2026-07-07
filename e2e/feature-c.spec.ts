import { test, expect, type Page } from '@playwright/test';

// Feature C (§4) / User Story 3: PostHog A/B toggle for the UI.
// The `alternate-ui` flag decides the theme: off -> variant A (light),
// on -> variant B (dark, `theme-b` class on <main>).
//
// A/B assignment is inherently non-deterministic per user, so we force a known
// flag value by stubbing PostHog's flag endpoint — the standard way to make an
// A/B feature testable. If the target build has no PostHog key baked in
// (VITE_POSTHOG_KEY empty), the SDK never calls PostHog; the test then skips,
// because variant B cannot be exercised without PostHog enabled.

async function gotoWithFlag(
  page: Page,
  enabled: boolean,
): Promise<boolean> {
  let posthogCalled = false;

  await page.route(/\.i\.posthog\.com/, async (route) => {
    const url = route.request().url();
    if (/\/(decide|flags)/.test(url)) {
      posthogCalled = true;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          featureFlags: { 'alternate-ui': enabled },
          featureFlagPayloads: {},
          errorsWhileComputingFlags: false,
        }),
      });
    } else {
      // Swallow all other PostHog traffic (events, etc.) so nothing hits the
      // real network during the test.
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
    }
  });

  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Secret Notes' })).toBeVisible();
  // Give the SDK a moment to request flags (if it is enabled at all).
  await page.waitForTimeout(1500);
  return posthogCalled;
}

test('Feature C: flag ON renders variant B (dark theme)', async ({ page }) => {
  const posthogActive = await gotoWithFlag(page, true);
  test.skip(!posthogActive, 'PostHog not enabled in this build (no VITE_POSTHOG_KEY) — variant B not applicable');

  await expect(page.locator('main.app.theme-b')).toBeVisible();
});

test('Feature C: flag OFF renders variant A (default theme)', async ({ page }) => {
  const posthogActive = await gotoWithFlag(page, false);
  test.skip(!posthogActive, 'PostHog not enabled in this build (no VITE_POSTHOG_KEY) — variant toggle not applicable');

  await expect(page.locator('main.app')).toBeVisible();
  await expect(page.locator('main.theme-b')).toHaveCount(0);
});
