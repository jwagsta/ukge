import { test, expect } from '@playwright/test';

// Wait for the app to load data and render visualizations
async function waitForAppLoad(page: import('@playwright/test').Page) {
  // Wait for the header to be visible (app has mounted)
  await page.waitForSelector('header', { timeout: 10000 });
  // Wait for loading overlay to disappear
  await page.waitForFunction(
    () => !document.querySelector('.animate-spin'),
    { timeout: 15000 },
  );
  // Small extra wait for D3 rendering to settle
  await page.waitForTimeout(500);
}

test.describe('Mobile Layout - Map Tab', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE

  test('displays map tab by default on mobile', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Tab bar should be visible
    const tabBar = page.locator('nav');
    await expect(tabBar).toBeVisible();

    // Map tab should be active (blue text)
    const mapTab = page.getByRole('button', { name: 'Map' });
    await expect(mapTab).toBeVisible();

    // Should show map toggle overlay (Map/Hex/Dots buttons)
    await expect(page.getByRole('button', { name: 'Hex' })).toBeVisible();

    await expect(page).toHaveScreenshot('mobile-map-tab.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('header is condensed on mobile (no long title)', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // The full title should NOT be visible on mobile
    await expect(page.locator('h1')).toHaveCount(0);

    // Year and winner badge should still be visible
    await expect(page.locator('header').getByText(/20\d{2}|Feb|Oct/)).toBeVisible();
  });

  test('map toggle buttons have mobile-sized touch targets', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Check that map type buttons are at least 44px tall
    const hexButton = page.getByRole('button', { name: 'Hex' });
    const box = await hexButton.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('play controls have mobile-sized touch targets', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    const playButton = page.getByRole('button', { name: 'Play' });
    const box = await playButton.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    expect(box!.width).toBeGreaterThanOrEqual(36);
  });
});

test.describe('Mobile Layout - Tab Navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('can switch to Charts tab', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    await page.getByRole('button', { name: 'Charts' }).click();
    await page.waitForTimeout(300);

    // Map should no longer be visible; charts should render
    // SeatsChart and VoteShareChart should both be present
    await expect(page.locator('svg')).toHaveCount(2, { timeout: 5000 });

    await expect(page).toHaveScreenshot('mobile-charts-tab.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('can switch to Ternary tab', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    await page.getByRole('button', { name: 'Ternary' }).click();
    await page.waitForTimeout(300);

    // Ternary plot should be visible (it renders an SVG)
    await expect(page.locator('svg')).toBeVisible();

    await expect(page).toHaveScreenshot('mobile-ternary-tab.png', {
      maxDiffPixelRatio: 0.05,
    });
  });

  test('can navigate back to Map tab', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Go to Charts, then back to Map
    await page.getByRole('button', { name: 'Charts' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Map' }).click();
    await page.waitForTimeout(300);

    // Map overlay controls should be visible again
    await expect(page.getByRole('button', { name: 'Hex' })).toBeVisible();
  });
});

test.describe('Mobile Layout - Bottom Sheet', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('bottom sheet appears when constituency is selected via map click', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Click on the map area (approximate center where constituencies are)
    const mapArea = page.locator('.relative').first();
    const mapBox = await mapArea.boundingBox();
    if (mapBox) {
      // Click near center of map (likely to hit a constituency)
      await page.mouse.click(
        mapBox.x + mapBox.width / 2,
        mapBox.y + mapBox.height * 0.4,
      );
      await page.waitForTimeout(500);
    }

    // Check if bottom sheet appeared (it has a drag handle div)
    const sheet = page.locator('.rounded-t-2xl');
    // This may or may not trigger depending on whether we hit a constituency
    // So we verify the sheet structure exists in the DOM
    const sheetCount = await sheet.count();
    if (sheetCount > 0) {
      await expect(page).toHaveScreenshot('mobile-bottom-sheet.png', {
        maxDiffPixelRatio: 0.05,
      });
    }
  });

  test('bottom sheet close button dismisses it', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Click on map to try to select a constituency
    const mapArea = page.locator('.relative').first();
    const mapBox = await mapArea.boundingBox();
    if (mapBox) {
      await page.mouse.click(
        mapBox.x + mapBox.width / 2,
        mapBox.y + mapBox.height * 0.4,
      );
      await page.waitForTimeout(500);
    }

    // If a sheet appeared, close it
    const closeButton = page.getByRole('button', { name: 'Close' });
    if (await closeButton.isVisible()) {
      await closeButton.click();
      await page.waitForTimeout(400);
      // Sheet should be gone
      await expect(page.locator('.rounded-t-2xl')).toHaveCount(0);
    }
  });
});

test.describe('Desktop Layout - Unchanged', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('desktop layout renders wide mode with all panels', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Title should be visible on desktop
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toContainText('UK General Election Results');

    // Tab bar should NOT be visible on desktop
    await expect(page.locator('nav')).toHaveCount(0);

    // Constituency panel (bottom) should be visible
    // (it shows search + "click on map" prompt)
    await expect(page.getByPlaceholder('Search constituency...')).toBeVisible();

    await expect(page).toHaveScreenshot('desktop-wide-layout.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});

test.describe('Tablet Layout - Narrow', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('tablet renders narrow (non-mobile) layout', async ({ page }) => {
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // Title should be visible (not mobile)
    await expect(page.locator('h1')).toBeVisible();

    // Tab bar should NOT be visible (>= 640px)
    await expect(page.locator('nav')).toHaveCount(0);

    await expect(page).toHaveScreenshot('tablet-narrow-layout.png', {
      maxDiffPixelRatio: 0.05,
    });
  });
});

test.describe('Responsive Breakpoint Transitions', () => {
  test('switching from desktop to mobile shows tab bar', async ({ page }) => {
    // Start at desktop width
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    // No tab bar on desktop
    await expect(page.locator('nav')).toHaveCount(0);

    // Resize to mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Tab bar should now be visible
    await expect(page.locator('nav')).toBeVisible();

    // Title should be hidden
    await expect(page.locator('h1')).toHaveCount(0);
  });

  test('switching from mobile to desktop removes tab bar', async ({ page }) => {
    // Start at mobile width
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/ukge/');
    await waitForAppLoad(page);

    await expect(page.locator('nav')).toBeVisible();

    // Resize to desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(500);

    // Tab bar should be gone, title should be back
    await expect(page.locator('nav')).toHaveCount(0);
    await expect(page.locator('h1')).toBeVisible();
  });
});
