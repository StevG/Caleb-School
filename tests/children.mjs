// Multiple children: per-child word lists/settings/stats, kid picker on the
// home screen, child tabs on the parent dashboard, add/rename/remove.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
// auto-answer the add-child prompt and the remove confirm
let promptAnswer = 'Maya';
page.on('dialog', d => d.type() === 'prompt' ? d.accept(promptAnswer) : d.accept());

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// single child -> no picker on the home screen
const pickerHidden = await page.$eval('#who-row', el => el.classList.contains('hidden'));
check('one child: no picker on the home screen', pickerHidden);

// open the dashboard: one tab (Caleb) + Add child
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(600);
let tabs = await page.$$eval('#child-tabs .child-tab', els => els.map(e => e.textContent.trim()));
check('dashboard shows the child tab + Add child',
  tabs.length === 2 && tabs[0].startsWith('Caleb') && tabs[1].includes('Add child'), JSON.stringify(tabs));
check('one child: no Remove button', await page.$eval('#remove-child', el => el.classList.contains('hidden')));

// add Maya via the + tab (prompt is auto-answered)
await page.click('#child-tabs .child-tab.add');
await page.waitForTimeout(700);
tabs = await page.$$eval('#child-tabs .child-tab', els => els.map(e => e.textContent.trim()));
const active = await page.$eval('#child-tabs .child-tab.active', el => el.textContent.trim());
check('add child: Maya tab appears and is selected',
  tabs.length === 3 && active.startsWith('Maya'), JSON.stringify(tabs));

// give Maya her own list + hearts-only; Caleb must not see either
await page.fill('#list-name', 'Maya week 1');
await page.fill('#custom-input', 'said because friend');
await page.click('#custom-add');
await page.waitForTimeout(400);
await page.click('#hearts-only');
await page.waitForTimeout(400);
const perChild = await page.evaluate(async () => {
  const get = async (c) => (await (await fetch(`/api/parent/report?child=${c}`,
    { headers: { 'X-Parent-Pin': '1234' } })).json());
  const maya = await get('c2'), caleb = await get('c1');
  return { maya: { lists: maya.lists.map(l => l.name), hearts: maya.profile.hearts_only },
           caleb: { lists: caleb.lists.map(l => l.name), hearts: caleb.profile.hearts_only } };
});
check('Maya has her list + hearts-only on',
  perChild.maya.lists.includes('Maya week 1') && perChild.maya.hearts === true,
  JSON.stringify(perChild.maya));
check('Caleb is untouched (no list, hearts-only off)',
  perChild.caleb.lists.length === 0 && perChild.caleb.hearts === false,
  JSON.stringify(perChild.caleb));

// switching tabs re-renders the other child's dashboard
await page.click('#child-tabs .child-tab');   // first tab = Caleb
await page.waitForTimeout(600);
const calebView = await page.evaluate(() => ({
  name: document.querySelector('#set-name').value,
  hearts: document.querySelector('#hearts-only').checked,
  lists: [...document.querySelectorAll('#lists-wrap .list-name')].map(e => e.textContent),
}));
check('tab switch: dashboard shows Caleb (his settings, no Maya list)',
  calebView.name === 'Caleb' && !calebView.hearts && calebView.lists.length === 0,
  JSON.stringify(calebView));

// home screen now has the picker; sessions/answers are per child
await page.click('#parent [data-home]');
await page.waitForTimeout(400);
const chips = await page.$$eval('#who-row .who-chip', els => els.map(e => e.textContent.trim()));
check('two children: picker chips on the home screen', chips.length === 2 && chips.includes('Maya'), JSON.stringify(chips));

// practice as Maya: her session draws from HER sources (hearts-only pool)
await page.click('.who-chip:has-text("Maya")');
await page.waitForTimeout(400);
const kidName = (await page.textContent('#kid-name')).trim();
check('picker switch: greeting shows Maya', kidName === 'Maya', kidName);
const mayaSession = await page.evaluate(async () => {
  const r = await (await fetch('/api/session?mode=words&count=10&child=c2')).json();
  return r.items.every(i => i.heart);
});
check('Maya session honors HER hearts-only setting', mayaSession);

// a point earned as Maya lands on Maya only
const pts = await page.evaluate(async () => {
  await fetch('/api/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ child: 'c2', word: 'said', correct: true, mode: 'words' }) });
  const s = await (await fetch('/api/state?child=c2')).json();
  return Object.fromEntries(s.children.map(c => [c.name, c.points]));
});
check('points stay per child', pts.Maya === 1 && pts.Caleb === 0, JSON.stringify(pts));

// device pick survives a reload (localStorage)
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check('reload: device still practices as Maya',
  (await page.textContent('#kid-name')).trim() === 'Maya');

// rename via settings updates the tab and the roster
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(600);
await page.click('#child-tabs .child-tab:has-text("Maya")');
await page.waitForTimeout(600);
await page.fill('#set-name', 'Maya Rose');
await page.click('#save-settings');
await page.waitForTimeout(500);
const renamed = await page.evaluate(async () => {
  const s = await (await fetch('/api/state?child=c2')).json();
  return s.name;
});
check('rename via settings sticks to that child', renamed === 'Maya Rose', renamed);

// remove Maya (confirm auto-accepted) -> back to one child, picker gone
await page.click('#remove-child');
await page.waitForTimeout(700);
const afterDelete = await page.evaluate(async () => {
  const s = await (await fetch('/api/state')).json();
  return { children: s.children.map(c => c.name),
           pickerHidden: document.querySelector('#who-row').classList.contains('hidden') };
});
check('remove child: only Caleb remains', JSON.stringify(afterDelete.children) === '["Caleb"]',
  JSON.stringify(afterDelete.children));
const lastDelete = await page.evaluate(async () => {
  const r = await fetch('/api/parent/children', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'delete', child: 'c1' }) });
  return r.status;
});
check('deleting the last child is refused (400)', lastDelete === 400, String(lastDelete));

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
