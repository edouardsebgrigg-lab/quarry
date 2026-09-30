// The settings screen from the main menu, one shot per tab (no 3D, so it's quick).
// OUT=<dir> TAG=<name> node docs/handover/browser-checks/settings.mjs
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const TAG = process.env.TAG ?? 'settings';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.QUARRY_URL || 'http://localhost:5174/');
await page.getByText('Settings').first().click();
await page.waitForTimeout(400);
for (const tab of ['Controls', 'Display', 'Sound', 'Game', 'Key bindings']) {
  await page.locator('.settings-nav button', { hasText: tab }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${process.env.OUT}/${TAG}-${tab.toLowerCase().replace(' ', '-')}.png` });
  console.log('shot', tab);
}
console.log('errors', errors.join('\n') || '(none)');
await browser.close();
