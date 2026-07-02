import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const OUT = '/tmp/claude-0/-home-user/27945fa0-10eb-51a8-82b0-25f497905001/scratchpad';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

const lineText = () => page.$$eval('#sentence-line span', els => els.map(e => ({cls: e.className, t: e.textContent.trim()})));

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// ================= FILL-IN SENTENCES =================
await page.click('.mode-card.sentences');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);
let spans = await lineText();
const allVisibleAtStart = spans.every(s => !s.t.includes('_'));
const curSpan = spans.find(s => s.cls === 'cur-word');
check('fill-in: ALL words visible before typing (incl. current)', allVisibleAtStart && !!curSpan && !curSpan.t.includes('_'), JSON.stringify(spans.slice(0,4)));
const todoVisible = spans.filter(s => s.cls === 'todo-word').every(s => !s.t.includes('_'));
check('fill-in: upcoming words readable (not blanks)', todoVisible);

// type first letter -> ONLY current word hides
const disp1 = (await page.textContent('#prompt-word')).trim();
const t1 = disp1.replace(/[^a-zA-Z'-]/g, '').toLowerCase();
await page.focus('#typed');
await page.type('#typed', t1[0]);
await page.waitForTimeout(120);
spans = await lineText();
const curNowHidden = spans.find(s => s.cls === 'cur-word')?.t.includes('_');
const othersStillVisible = spans.filter(s => s.cls === 'todo-word').every(s => !s.t.includes('_'));
const promptGone = await page.$eval('#prompt-word', el => el.classList.contains('gone'));
check('fill-in: first keystroke hides ONLY the current word', curNowHidden && othersStillVisible && promptGone);
await page.screenshot({ path: `${OUT}/s1-fillin-typing.png` });

// complete the whole sentence
let sentenceDone = false;
for (let w = 0; w < 14; w++) {
  const d = (await page.textContent('#prompt-word')).trim();
  const target = d.replace(/[^a-zA-Z'-]/g, '');
  await page.focus('#typed');
  await page.fill('#typed', target);
  await page.dispatchEvent('#typed', 'input');
  if (await page.$eval('#check', el => el.disabled)) { check('fill-in: check enabled for ' + d, false); break; }
  await page.click('#check');
  await page.waitForTimeout(950);
  const hint = (await page.textContent('#prompt-hint')).trim();
  if (hint.includes('whole sentence')) { sentenceDone = true; break; }
}
check('fill-in: sentence completable word by word', sentenceDone);

// ================= MEMORY MODE =================
await page.waitForTimeout(900);
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.click('.mode-card.memory');
await page.waitForSelector('#play.active');
await page.waitForTimeout(300);

// memorize phase: full sentence, ready button, speaker visible
spans = await lineText();
const allShown = spans.length > 0 && spans.every(s => !s.t.includes('_'));
const readyBtn = (await page.textContent('#next')).trim();
const checkHidden = await page.$eval('#check', el => el.classList.contains('hidden'));
const speakerShown = await page.$eval('#speaker', el => !el.classList.contains('hidden'));
const bigRead = await page.$eval('#sentence-line', el => el.classList.contains('reading'));
check('memory: memorize phase shows whole sentence + Im ready + speaker', allShown && readyBtn.includes('ready') && checkHidden && speakerShown && bigRead, `btn="${readyBtn}"`);
const sentence = spans.map(s => s.t).join(' ');
await page.screenshot({ path: `${OUT}/s2-memory-read.png` });

// speaker in memorize phase speaks whole sentence (probe the utterance text)
const spoken = await page.evaluate(() => {
  let captured = '';
  const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
  window.speechSynthesis.speak = (u) => { captured = u.text; };
  document.getElementById('speaker').click();
  return captured;
});
check('memory: speaker reads the WHOLE sentence', spoken.split(' ').length >= 4, `"${spoken}"`);

// tap ready -> everything hides, boxes appear for word 1
await page.click('#next');
await page.waitForTimeout(200);
spans = await lineText();
const allBlank = spans.every(s => s.t.includes('_') || s.cls === 'done-word');
const promptEmpty = (await page.textContent('#prompt-word')).trim() === '';
const boxCount = await page.$$eval('#boxes .box', els => els.length);
const hint1 = (await page.textContent('#prompt-hint')).trim();
check('memory: after ready, sentence fully hidden, boxes only', allBlank && promptEmpty && boxCount > 0, `hint="${hint1}"`);
await page.screenshot({ path: `${OUT}/s3-memory-typing.png` });

// type the whole sentence from "memory" (we captured it in the read phase)
const words = sentence.split(' ').map(w => w.replace(/[^a-zA-Z'-]/g, '')).filter(Boolean);
let memoryDone = false;
for (const w of words) {
  await page.focus('#typed');
  await page.fill('#typed', w);
  await page.dispatchEvent('#typed', 'input');
  if (await page.$eval('#check', el => el.disabled)) { check('memory: check enabled for ' + w, false); break; }
  await page.click('#check');
  await page.waitForTimeout(950);
  const hint = (await page.textContent('#prompt-hint')).trim();
  if (hint.includes('whole sentence')) { memoryDone = true; break; }
}
check('memory: full sentence typeable from memory', memoryDone);

// wrong answer path in memory: next sentence, get word 1 wrong
await page.waitForTimeout(900);
const inMemorize = (await page.textContent('#next')).trim().includes('ready');
if (inMemorize) {
  await page.click('#next');
  await page.waitForTimeout(200);
  const n = await page.$eval('#typed', el => parseInt(el.maxLength, 10));
  await page.focus('#typed');
  await page.fill('#typed', 'z'.repeat(n));
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(1100);
  const revealed = (await page.textContent('#prompt-word')).trim();
  const tryAgain = (await page.textContent('#next')).trim();
  check('memory: wrong answer reveals the word + Try again', revealed.length > 0 && tryAgain === 'Try again', `revealed="${revealed}"`);
  await page.click('#next');
  await page.waitForTimeout(200);
  await page.focus('#typed');
  await page.fill('#typed', revealed.replace(/[^a-zA-Z'-]/g, ''));
  await page.dispatchEvent('#typed', 'input');
  await page.click('#check');
  await page.waitForTimeout(400);
  check('memory: retry accepted (aided)', await page.$eval('#feedback', el => el.className.includes('good')));
} else {
  check('memory: wrong-path test reached', false, 'did not land in memorize phase');
}

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
