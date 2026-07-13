// Parent feedback -> the server-notes loop: PIN-gated submit (text +
// screenshots), the note surfaces on /.hub/status, and the dashboard card
// (textarea + screenshot attach + speech-to-text hint) sends and confirms.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const SHOT = '/tmp/claude-0/-home-user-Caleb-School/8dea0d7b-0f6d-52c4-98ec-ef66e5a4906d/scratchpad/shot.png';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);
page.on('dialog', d => d.accept());
const post = (u, b) => page.evaluate(([u, b]) => fetch(u, { method: 'POST',
  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await r.json().catch(()=>({})) })), [u, b]);
const get = (u) => page.evaluate(u => fetch(u).then(r => r.json()), u);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// ---------- server: PIN gate ----------
const bad = await post('/api/parent/feedback', { pin: '0000', text: 'hi' });
check('feedback: wrong PIN is rejected (403)', bad.status === 403, JSON.stringify(bad));
const empty = await post('/api/parent/feedback', { pin: '1234', text: '' });
check('feedback: empty submission is rejected (400)', empty.status === 400, JSON.stringify(empty));

// ---------- server: a text note ----------
const ok = await post('/api/parent/feedback', { pin: '1234', text: 'the Listen game audio stopped after a few words', device: 'iPhone' });
check('feedback: a text note is accepted', ok.status === 200 && ok.body.ok === true, JSON.stringify(ok));

// ---------- server: a screenshot note ----------
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const withShot = await post('/api/parent/feedback', { pin: '1234', text: 'button overlaps here', screenshots: [tinyPng, tinyPng] });
check('feedback: screenshots are saved and counted', withShot.body.ok === true && withShot.body.screenshots === 2, JSON.stringify(withShot.body));

// ---------- the note surfaces on /.hub/status (the HomeHub glance) ----------
const hub = await get('/.hub/status');
const fbField = (hub.fields || []).find(f => /Feedback/.test(f.label));
check('hub status: a Feedback field appears with a count + latest snippet',
  !!fbField && /\d+/.test(fbField.value) && /Listen game|button overlaps/.test(fbField.value),
  JSON.stringify(fbField));

// ---------- UI: the dashboard card ----------
await page.click('#gear');
for (const d of ['1','2','3','4']) await page.click(`.pin-key:has-text("${d}")`);
await page.waitForSelector('#parent.active');
await page.waitForTimeout(500);
// scroll the card into view
await page.evaluate(() => document.getElementById('fb-text').scrollIntoView());
check('dashboard: the feedback card is present', await page.isVisible('#fb-text') && await page.isVisible('#fb-send'));
const note = await page.textContent('.card:has(#fb-text) .card-note');
check('dashboard: speech-to-text is encouraged', /🎤|microphone|talk/.test(note), note.slice(0, 60));

// attach a screenshot via the file input -> a thumbnail appears
await page.setInputFiles('#fb-file', SHOT);
await page.waitForTimeout(500);
const thumbs = await page.$$eval('#fb-thumbs .fb-thumb', els => els.length);
check('dashboard: attaching a screenshot shows a thumbnail', thumbs === 1, `thumbs=${thumbs}`);
// the downscaled dataURL is a jpeg (browser-side compression, no libraries)
const isJpeg = await page.evaluate(() => fbShots[0] && fbShots[0].dataURL.startsWith('data:image/jpeg'));
check('dashboard: the screenshot was downscaled to a JPEG in-browser', isJpeg === true);

// type + send
await page.fill('#fb-text', 'idea: a dark mode for bedtime practice');
await page.click('#fb-send');
await page.waitForTimeout(600);
const saved = await page.textContent('#fb-saved');
check('dashboard: sending confirms success', /Sent|Thanks/.test(saved), saved);
check('dashboard: the form clears after sending',
  (await page.inputValue('#fb-text')) === '' && (await page.$$eval('#fb-thumbs .fb-thumb', e => e.length)) === 0);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
