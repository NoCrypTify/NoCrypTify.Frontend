import { test, expect } from '@playwright/test';

// End-to-end tests for the Secret Notes UI (Feature A + B), driven through the
// real browser against a deployed environment. These are the tests the CD
// pipeline runs against the inactive blue/green environment before switching
// traffic — a failure here must block the switch.

// Unique per run so parallel runs / retries never collide on the same note.
function uniqueTitle(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

async function createNote(
  page: import('@playwright/test').Page,
  opts: { title: string; content: string; key: string },
): Promise<void> {
  // Relative './' respects a sub-path baseURL (e.g. .../staging/); a leading
  // '/' would jump to the origin root and bypass the sub-path.
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Secret Notes' })).toBeVisible();

  await page.getByPlaceholder('Title (optional)').fill(opts.title);
  await page.getByPlaceholder('Your secret content…').fill(opts.content);
  await page.getByPlaceholder('Encryption key / passphrase').fill(opts.key);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page.getByText('Note created and stored securely.')).toBeVisible();
}

async function openNote(page: import('@playwright/test').Page, title: string): Promise<void> {
  await page.getByRole('button', { name: title }).first().click();
  await expect(page.getByPlaceholder('Decryption key')).toBeVisible();
}

test('creates a note and confirms it is stored securely', async ({ page }) => {
  const title = uniqueTitle('create');
  await createNote(page, { title, content: 'top secret content', key: 'pw-key-1' });

  // The new note shows up in the list.
  await expect(page.getByRole('button', { name: title }).first()).toBeVisible();
});

test('reveals a note with the correct key (Feature B — happy path)', async ({ page }) => {
  const title = uniqueTitle('reveal-ok');
  const content = `plaintext-${Date.now()}`;
  const key = 'pw-correct-key';

  await createNote(page, { title, content, key });
  await openNote(page, title);

  await page.getByPlaceholder('Decryption key').fill(key);
  await page.getByRole('button', { name: 'Decrypt' }).click();

  // Decrypted plaintext is shown, no error.
  await expect(page.locator('pre.revealed')).toHaveText(content);
  await expect(page.locator('.err')).toHaveCount(0);
});

test('rejects a note with the wrong key (Feature B — access denied)', async ({ page }) => {
  const title = uniqueTitle('reveal-bad');
  await createNote(page, { title, content: 'must stay secret', key: 'the-real-key' });
  await openNote(page, title);

  await page.getByPlaceholder('Decryption key').fill('definitely-wrong-key');
  await page.getByRole('button', { name: 'Decrypt' }).click();

  // Error surfaced (backend returns 403 "Invalid key"), plaintext never shown.
  await expect(page.locator('.err')).toBeVisible();
  await expect(page.locator('pre.revealed')).toHaveCount(0);
});

test('does not create a note when required fields are empty (validation)', async ({ page }) => {
  await page.goto('./');
  // Submit with empty content + key: HTML5 `required` blocks submission.
  await page.getByRole('button', { name: 'Create' }).click();

  // The required content field is invalid and nothing was stored.
  await expect(page.getByPlaceholder('Your secret content…')).toHaveJSProperty(
    'validity.valid',
    false,
  );
  await expect(page.getByText('Note created and stored securely.')).toHaveCount(0);
});

test('persists a created note across a page reload', async ({ page }) => {
  const title = uniqueTitle('persist');
  await createNote(page, { title, content: 'still here after reload', key: 'persist-key' });

  await page.reload();

  // The note is re-fetched from the backend and still listed.
  await expect(page.getByRole('button', { name: title }).first()).toBeVisible();
});
