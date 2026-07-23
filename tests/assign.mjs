// Assignments (missions) + notifications: parent assigns a mode+list test,
// it lands on the kid's home screen, playing it uses exactly the list's
// words, finishing stores the score and pings subscribed parent devices
// (local push sink verifies the VAPID tickle + pull message).
import http from 'http';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept());

// local push sink standing in for Apple/Google's push service
const tickles = [];
const sink = http.createServer((req, res) => {
  tickles.push({ url: req.url, auth: req.headers.authorization || '', ttl: req.headers.ttl });
  res.writeHead(201); res.end();
});
await new Promise(r => sink.listen(9925, '127.0.0.1', r));

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// seed: a list + subscriptions for a kid device and a parent device
await page.evaluate(async () => {
  const post = (u, b) => fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  await post('/api/parent/lists', { pin: '1234', action: 'create', name: 'Friday test', words: 'said friend because' });
  await post('/api/push/subscribe', { role: 'child', child: 'c1', subscription: { endpoint: 'http://127.0.0.1:9925/push/kid-ipad' } });
  await post('/api/push/subscribe', { role: 'parent', pin: '1234', subscription: { endpoint: 'http://127.0.0.1:9925/push/dad-phone' } });
});

// parent assigns through the UI
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(700);
const listOpts = await page.$$eval('#assign-list option', els => els.map(e => e.textContent));
check('assign form lists the word lists', listOpts.some(o => o.includes('Friday test')), JSON.stringify(listOpts));
await page.selectOption('#assign-mode', 'words');
await page.selectOption('#assign-list', { label: 'Friday test' });
await page.click('#assign-create');
await page.waitForTimeout(800);
const openRows = await page.$$eval('#assign-open .assign-row .ar-what', els => els.map(e => e.textContent));
check('assignment appears as waiting', openRows.length === 1 && openRows[0].includes('Friday test'), JSON.stringify(openRows));

// sentence modes disable the list picker
await page.selectOption('#assign-mode', 'memory');
const listDisabled = await page.$eval('#assign-list', el => el.disabled);
check('sentence-mode assignment disables the list picker', listDisabled);
await page.selectOption('#assign-mode', 'words');

// the kid device got tickled about the new mission
await page.waitForTimeout(1500);
const kidTickle = tickles.find(t => t.url === '/push/kid-ipad');
check('kid device got a VAPID tickle on assign',
  !!kidTickle && kidTickle.auth.startsWith('vapid t=') && kidTickle.ttl === '86400',
  JSON.stringify(kidTickle || {}).slice(0, 90));
const kidMsg = await page.evaluate(async () => {
  const r = await (await fetch('/api/push/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: 'http://127.0.0.1:9925/push/kid-ipad' }) })).json();
  return r.messages;
});
check('pull hands the SW the mission message',
  kidMsg.length === 1 && kidMsg[0].title.includes('mission') && kidMsg[0].body.includes('Friday test'),
  JSON.stringify(kidMsg));

// kid home shows the mission card
await page.click('#parent [data-home]');
await page.waitForTimeout(600);
const mission = await page.evaluate(() => {
  const card = document.querySelector('.mission-card');
  return { shown: !document.getElementById('missions').classList.contains('hidden'),
           text: card ? card.textContent : '' };
});
check('mission card on the kid home screen',
  mission.shown && mission.text.includes('Hide & Spell') && mission.text.includes('Friday test'), mission.text.trim());

// play the mission: exactly the 3 list words, hidden-on-type (stage 2)
await page.click('.mission-card');
await page.waitForSelector('#play.active');
await page.waitForTimeout(400);
const listWords = new Set(['said', 'friend', 'because']);
let sawWords = [], allInList = true;
for (let i = 0; i < 3; i++) {
  const t = await page.evaluate(() => state.target);
  sawWords.push(t);
  if (!listWords.has(t)) allInList = false;
  await page.focus('#typed');
  await page.fill('#typed', t);
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(1000);
}
check('mission session = exactly the list words', allInList && new Set(sawWords).size === 3, JSON.stringify(sawWords));
await page.waitForTimeout(600);
const doneNote = await page.evaluate(() => ({
  done: document.getElementById('done').classList.contains('active'),
  note: document.getElementById('level-ups').textContent }));
check('done screen celebrates the mission', doneNote.done && doneNote.note.includes('Mission complete'), JSON.stringify(doneNote));

// parent device pinged with the score; dashboard shows it as done
await page.waitForTimeout(1500);
const dadTickle = tickles.find(t => t.url === '/push/dad-phone');
check('parent device got a tickle on completion', !!dadTickle && dadTickle.auth.startsWith('vapid t='));
const dadMsg = await page.evaluate(async () => {
  const r = await (await fetch('/api/push/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: 'http://127.0.0.1:9925/push/dad-phone' }) })).json();
  return r.messages;
});
// the queue may also hold badge-earned pings (a finished mission earns
// Mission Hero etc.) — the mission message is the one carrying the score
check('parent message carries the score', dadMsg.some(m => m.body.includes('3/3')), JSON.stringify(dadMsg));

// mission gone from home; dashboard shows the completed row, deletable
await page.click('#home-btn');
await page.waitForTimeout(600);
const missionGone = await page.$eval('#missions', el => el.classList.contains('hidden'));
check('finished mission leaves the home screen', missionGone);
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForTimeout(700);
const doneRow = await page.$eval('#assign-done .assign-row', el => el.textContent);
check('dashboard shows the completed test with its score',
  doneRow.includes('Friday test') && doneRow.includes('3/3'), doneRow.trim());

// assign to EVERY child at once
await page.evaluate(() => fetch('/api/parent/children', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ pin: '1234', action: 'add', name: 'Sis' }) }));
await page.waitForTimeout(400);
const both = await page.evaluate(async () => {
  await fetch('/api/parent/assign', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234', action: 'create', mode: 'sentences', all_children: true }) });
  const get = async (c) => (await (await fetch(`/api/state?child=${c}`)).json()).missions.length;
  return { c1: await get('c1'), c2: await get('c2') };
});
check('all-children assignment reaches every kid', both.c1 === 1 && both.c2 === 1, JSON.stringify(both));

// cancel an open assignment from the dashboard
await page.evaluate(() => window.openParent());
await page.waitForTimeout(600);
await page.click('#assign-open .assign-row .wr-x');
await page.waitForTimeout(600);
const openLeft = await page.evaluate(async () =>
  (await (await fetch('/api/state?child=c1')).json()).missions.length);
check('cancelling removes the mission', openLeft === 0, String(openLeft));

// the parent sizes an open-ended mission with the word-count picker
await page.evaluate(() => window.openParent());
await page.waitForTimeout(500);
const countDefault = await page.$eval('#assign-count', el => el.value);
check('word-count picker defaults to 10', countDefault === '10', countDefault);
// a school list is its whole set, sentence games are fixed → picker greys out
await page.selectOption('#assign-mode', 'words');
await page.selectOption('#assign-list', { label: 'Friday test' });
check('school list disables the word-count picker',
  await page.$eval('#assign-count', el => el.disabled));
await page.selectOption('#assign-mode', 'memory');
check('sentence mode disables the word-count picker',
  await page.$eval('#assign-count', el => el.disabled));
// back to an open-ended source: his checked words, sized to 5
await page.selectOption('#assign-mode', 'words');
await page.selectOption('#assign-list', '');
check('checked-words source enables the word-count picker',
  await page.$eval('#assign-count', el => !el.disabled));
await page.selectOption('#assign-count', '5');
await page.click('#assign-create');
await page.waitForTimeout(800);
const sized = await page.evaluate(async () =>
  (await (await fetch('/api/state?child=c1')).json()).missions);
check('parent-set count sizes the mission',
  sized.length === 1 && sized[0].count === 5 && sized[0].name === 'Practice words',
  JSON.stringify(sized));

sink.close();
console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
