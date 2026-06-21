import { test, expect } from '@playwright/test';

// ── Boot smoke ──────────────────────────────────────────────────────────────
// Runs against the built frontend with no backend. Catches white-screen /
// bundle / render regressions: the SPA must boot and present the login form.
test.describe('app boot', () => {
  test('login screen renders with credential fields', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    await expect(page.getByPlaceholder('Enter your username')).toBeVisible();
    await expect(page.getByPlaceholder('Enter your password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('no uncaught JavaScript errors on load', async ({ page }) => {
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
    expect(pageErrors).toEqual([]);
  });
});

// ── Authenticated core flow ─────────────────────────────────────────────────
// Runs only against a live deployment with a seeded user. Export:
//   E2E_BASE_URL, E2E_USERNAME, E2E_PASSWORD
// (a 2FA-enabled user can't be driven headlessly, so use a non-2FA test user).
const FULL = Boolean(
  process.env.E2E_BASE_URL && process.env.E2E_USERNAME && process.env.E2E_PASSWORD,
);

test.describe('authenticated core flow', () => {
  test.skip(
    !FULL,
    'Set E2E_BASE_URL, E2E_USERNAME, E2E_PASSWORD to run against a live deployment',
  );

  test('sign in reaches the application shell', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Enter your username').fill(process.env.E2E_USERNAME);
    await page.getByPlaceholder('Enter your password').fill(process.env.E2E_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Land on either the 2FA challenge or the module bar (Jobs is the default surface).
    await expect(
      page
        .getByRole('heading', { name: 'Two-Factor Authentication' })
        .or(page.getByText('Jobs').first()),
    ).toBeVisible({ timeout: 15_000 });
  });
});
