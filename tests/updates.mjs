// Update-prompt flow: the app notices a new deploy and offers a refresh.
// Chromium (unlike iOS home-screen PWAs) fires SW updatefound reliably, but
// we test the version-poll path too since that's the iOS-reliable trigger.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { execSync } from 'node:child_process';
const { chromium } = pw;
const REPO = '/home/user/Caleb-School';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

// no banner on a fresh, up-to-date load
const hiddenAtStart = await page.$eval('#update-bar', el => el.classList.contains('hidden'));
check('no update bar on a current version', hiddenAtStart);
const bootV = await page.evaluate(() => bootVersion);
check('boot captured a version', !!bootV, bootV);

// simulate a deploy: change a static file so /api/version changes
execSync(`touch ${REPO}/static/app.js`);
const newV = JSON.parse(execSync('curl -s http://127.0.0.1:9911/api/version')).version;
check('server version changed after deploy', newV !== bootV, `${bootV} -> ${newV}`);

// bring the app back to the foreground -> it should notice and nag
await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
await page.waitForFunction(() => !document.getElementById('update-bar').classList.contains('hidden'), { timeout: 5000 }).catch(() => {});
const barShown = await page.$eval('#update-bar', el => !el.classList.contains('hidden'));
check('update bar appears after a deploy', barShown);
const padded = await page.$eval('body', el => el.classList.contains('has-update'));
check('screens get top padding so nothing hides behind the bar', padded);
await page.screenshot({ path: '/tmp/claude-0/-home-user/27945fa0-10eb-51a8-82b0-25f497905001/scratchpad/update-bar.png' });

// tapping Update reloads the page
await page.evaluate(() => { window.__beforeReload = true; });
await Promise.all([
  page.waitForNavigation({ waitUntil: 'load', timeout: 8000 }).catch(() => {}),
  page.click('#update-btn'),
]);
await page.waitForTimeout(600);
const reloaded = await page.evaluate(() => window.__beforeReload === undefined);
check('Update button reloads the app', reloaded);
// after reload the version matches, so no bar
await page.waitForTimeout(400);
const clearAfter = await page.$eval('#update-bar', el => el.classList.contains('hidden'));
check('bar is gone after updating (version now matches)', clearAfter);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
