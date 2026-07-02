// Speech robustness: the iOS-safe speak path (cancel-then-delay, resume,
// speaking pulse), the session-start audio unlock, and per-mode utterances.
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const results = [];
const check = (n, ok, x='') => results.push(`${ok?'PASS':'FAIL'}  ${n}${x?' — '+x:''}`);

await page.goto('http://127.0.0.1:9911', { waitUntil: 'networkidle' });

// a controllable stand-in for window.speechSynthesis
await page.evaluate(() => {
  window.__log = [];
  window.__stub = {
    speaking: false, pending: false,
    resume() { window.__log.push('resume'); },
    cancel() { window.__log.push('cancel'); this.speaking = false; },
    speak(u) {
      window.__log.push('speak:' + u.text);
      window.__lastU = u;
      if (u.onstart) u.onstart();
    },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: window.__stub, configurable: true });
});

// idle path: resume -> speak, no cancel; pulse class on while "talking"
const idle = await page.evaluate(async () => {
  window.__log = [];
  speakText('hello there');
  const pulsing = document.getElementById('speaker').classList.contains('speaking');
  window.__lastU.onend();
  const stopped = !document.getElementById('speaker').classList.contains('speaking');
  return { log: window.__log, pulsing, stopped };
});
check('idle: resume then speak, no cancel', JSON.stringify(idle.log) === '["resume","speak:hello there"]', JSON.stringify(idle.log));
check('speaker pulses while talking, stops on end', idle.pulsing && idle.stopped);

// busy path (the iOS killer): tap while still talking -> cancel, then the
// NEW utterance still gets spoken (after the settle delay), never dropped
const busy = await page.evaluate(async () => {
  window.__log = [];
  window.__stub.speaking = true;
  speakText('second tap');
  const atOnce = [...window.__log];
  await new Promise(r => setTimeout(r, 200));
  return { atOnce, after: window.__log };
});
check('busy: cancel first, speak is NOT fired in the same tick',
  JSON.stringify(busy.atOnce) === '["resume","cancel"]', JSON.stringify(busy.atOnce));
check('busy: the new utterance is spoken after the settle delay',
  busy.after[busy.after.length - 1] === 'speak:second tap', JSON.stringify(busy.after));

// rapid double-tap: only the LAST utterance survives the settle delay
const doubletap = await page.evaluate(async () => {
  window.__log = [];
  window.__stub.speaking = true;
  speakText('first');
  window.__stub.speaking = true;
  speakText('last');
  await new Promise(r => setTimeout(r, 250));
  return window.__log.filter(l => l.startsWith('speak:'));
});
check('double-tap: only the last utterance plays', JSON.stringify(doubletap) === '["speak:last"]', JSON.stringify(doubletap));

// session start burns the tap on a silent unlock -> auto-speak may follow
const listen = await page.evaluate(async () => {
  window.__log = [];
  window.__stub.speaking = false;
  document.querySelector('.section-card.sec-words').click();
  document.querySelector('.mode-card.listen').click();
  await new Promise(r => setTimeout(r, 100));
  document.querySelector('.chip[data-goal="10"]').click();
  await new Promise(r => setTimeout(r, 1200));
  const speaks = window.__log.filter(l => l.startsWith('speak:'));
  return { first: speaks[0], count: speaks.length };
});
check('listen session: silent unlock utterance rides the start tap',
  listen.first === 'speak:', JSON.stringify(listen));
check('listen session: the first word is auto-spoken after the unlock',
  listen.count >= 2, String(listen.count));

// memory mode: the speaker reads the WHOLE sentence in the typing phase too
await page.evaluate(() => { window.quitToHome = true; });
await page.click('#quit');
await page.waitForSelector('#home.active');
await page.click('.section-card.sec-sent'); await page.click('.mode-card.memory');
await page.waitForSelector('#play.active');
await page.waitForTimeout(500);
const memory = await page.evaluate(async () => {
  window.__log = [];
  document.getElementById('speaker').click();     // memorize phase
  document.getElementById('next').click();        // "I'm ready!"
  await new Promise(r => setTimeout(r, 300));
  document.getElementById('speaker').click();     // typing phase
  await new Promise(r => setTimeout(r, 200));
  const speaks = window.__log.filter(l => l.startsWith('speak:') && l.length > 8);
  return { speaks, sentence: state.sentence.s };
});
check('memory: speaker reads the whole sentence in BOTH phases',
  memory.speaks.length === 2 && memory.speaks.every(s => s === 'speak:' + memory.sentence),
  JSON.stringify(memory.speaks));

// leaving play cancels any speech in flight
await page.click('#quit');
await page.waitForSelector('#home.active');
const cancelled = await page.evaluate(() => window.__log.includes('cancel'));
check('quit cancels speech in flight', cancelled);

console.log(results.join('\n'));
console.log('\nJS ERRORS:', errors.length ? errors : 'none');
await browser.close();
process.exit(results.some(r => r.startsWith('FAIL')) ? 1 : 0);
