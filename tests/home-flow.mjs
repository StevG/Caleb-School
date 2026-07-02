// Home menu flow: tapping a word game slides the other games away and puts
// the how-many chips directly under the chosen card; "⬅ All games" undoes it.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// baseline: 4 cards, no chips
const base = await page.evaluate(() => ({
  cards: [...document.querySelectorAll('.mode-card')].filter(c => c.offsetParent).length,
  chips: !document.getElementById('goal-row').classList.contains('hidden') }));
check('start: all 5 games shown, no chips', base.cards === 5 && !base.chips, JSON.stringify(base));

// tap Spell Words -> others leave, chips arrive right under the words card
await page.click('.mode-card.words');
await page.waitForTimeout(500);
const chosen = await page.evaluate(() => {
  const words = document.querySelector('.mode-card.words');
  const visible = [...document.querySelectorAll('.mode-card')].filter(c => c.offsetParent);
  return { visible: visible.length, onlyWords: visible[0] === words,
           chipsNext: words.nextElementSibling?.id === 'goal-row',
           chipsShown: !document.getElementById('goal-row').classList.contains('hidden'),
           backShown: !!document.getElementById('goal-back').offsetParent,
           stillHome: document.getElementById('home').classList.contains('active') };
});
check('tap Spell Words: only that card remains', chosen.visible === 1 && chosen.onlyWords, JSON.stringify(chosen));
check('chips sit DIRECTLY under the chosen card', chosen.chipsNext && chosen.chipsShown);
check('back button offered, nothing started yet', chosen.backShown && chosen.stillHome);

// back -> the full menu returns, nothing started
await page.click('#goal-back');
await page.waitForTimeout(500);
const backed = await page.evaluate(() => ({
  cards: [...document.querySelectorAll('.mode-card')].filter(c => c.offsetParent).length,
  chips: !document.getElementById('goal-row').classList.contains('hidden'),
  home: document.getElementById('home').classList.contains('active') }));
check('⬅ All games restores the full menu', backed.cards === 5 && !backed.chips && backed.home, JSON.stringify(backed));

// switch to Listen & Spell instead -> chips under THAT card now
await page.click('.mode-card.listen');
await page.waitForTimeout(500);
const listen = await page.evaluate(() =>
  document.querySelector('.mode-card.listen').nextElementSibling?.id === 'goal-row');
check('chips follow whichever card was tapped', listen);

// picking a count starts the session
await page.click('.chip[data-goal="10"]');
await page.waitForSelector('#play.active');
check('picking a count starts the game', true);

// quitting puts the whole menu back
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.waitForTimeout(500);
const restored = await page.evaluate(() => ({
  cards: [...document.querySelectorAll('.mode-card')].filter(c => c.offsetParent).length,
  chips: !document.getElementById('goal-row').classList.contains('hidden') }));
check('after quitting, home shows all 5 games again', restored.cards === 5 && !restored.chips, JSON.stringify(restored));

// sentence modes still start with a single tap (no chips step)
await page.click('.mode-card.sentences');
await page.waitForSelector('#play.active');
check('Spell Sentences still starts straight away', true);
await page.click('#quit');
await page.waitForSelector('#home.active');

// the ⚙️ gear must stay tappable even when the home content scrolls — iOS
// otherwise lets the momentum-scroll layer under it swallow the tap
const short = await browser.newContext({ viewport: { width: 390, height: 430 } });
const sp = await short.newPage();
await sp.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
const gearOK = await sp.evaluate(() => {
  const g = document.getElementById('gear');
  const r = g.getBoundingClientRect();
  const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  const scrolls = document.querySelector('.home-inner');
  return { onTop: top === g, scrolls: scrolls.scrollHeight > scrolls.clientHeight + 1,
           tapH: Math.round(r.height) };
});
check('gear: on top and >=44px tall even while home scrolls',
  gearOK.onTop && gearOK.scrolls && gearOK.tapH >= 44, JSON.stringify(gearOK));
await sp.click('#gear');
await sp.waitForTimeout(200);
check('gear opens the grown-ups gate from a scrolling home',
  await sp.$eval('#gate', el => el.classList.contains('active')));
await short.close();

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
