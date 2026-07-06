import { test, expect } from '@playwright/test';

test('Frontend loads and displays correctly on staging', async ({ page }) => {
  const stagingUrl = process.env.STAGING_URL || 'https://staging.deine-api.com';
  
  await page.goto(stagingUrl);

  await expect(page).toHaveTitle(/Secret Notes/i);
});