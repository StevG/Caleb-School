"use strict";

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  return r.ok ? r.json() : Promise.reject(await r.json().catch(() => ({})));
};
const postJSON = (url, body) => api(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
// One rule for what counts as a typeable spelling character; the server's
// word bank and custom-word cleaning follow the same rule. Sentence modes
// keep the capitals (he must type them); word modes compare lowercase.
const cleanChars = (s) => s.replace(/[^a-zA-Z'-]/g, "");
const toTarget = (s) => cleanChars(s).toLowerCase();
const MODE_LABELS = { words: "Spell Words", listen: "Listen & Spell",
                      sentences: "Spell Sentences", memory: "Memory Sentences" };
function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screenId).classList.add("active");
}

// ---------- app state ----------
const state = {
  mode: "words",
  goal: 10,
  showSpeaker: true,
  points: 0,
  parentPin: "",
  // multiple kids: this DEVICE remembers who practices on it; the parent
  // dashboard has its own independent selection (parentChild)
  childId: "",
  children: [],      // roster from the server: [{id, name, points}]
  parentChild: "",   // the child the dashboard is showing/editing
  assignment: null,  // mission id when the current session IS a mission
  // session
  queue: [],      // items still to do (words mode: {w,group}; sentences: token views)
  total: 0,       // queue items (words, or whole sentences)
  wordsDone: 0,   // individual words completed (both modes)
  correctCount: 0, // words right on the first try (unaided)
  earned: 0,      // points this session (includes aided retries)
  finished: false,
  // current item
  target: "",     // the string being spelled right now
  missedThisItem: false,
  requeued: false,
  answered: false,
  sentence: null,    // {s, tokens, wordIdx} in sentence/memory modes
  curHidden: false,  // sentence line: is the current word masked yet?
  memorizing: false, // memory mode: still in the read-the-sentence phase
  caseSensitive: false, // sentence modes require the capitals too
  itemStage: 2,      // ladder stage of the current word (words mode)
  itemHeart: null,   // irregular grapheme(s) of the current heart word
  keepVisible: false, // stage 1 "copy it": word stays visible while typing
  levelUps: 0,       // stage-ups this session (celebrated on the done screen)
  // ignore typing while a result is showing. We use this flag instead of
  // disabling the input: disabling blurs it, which closes the iOS keyboard
  // between every word and forces an extra tap to bring it back.
  locked: false,
};

// ---------- boot ----------
function storedChild() {
  try { return localStorage.getItem("spelling-child") || ""; }
  catch (_) { return ""; }
}
function storeChild(id) {
  try { localStorage.setItem("spelling-child", id); } catch (_) {}
}

function refreshState() {
  return api("/api/state?child=" + encodeURIComponent(state.childId))
    .then((s) => {
      state.childId = s.child;    // the server resolves stale/deleted ids
      storeChild(s.child);
      state.children = s.children || [];
      state.points = s.points || 0;
      state.showSpeaker = s.show_speaker !== false;
      $("kid-name").textContent = s.name || "Caleb";
      $("home-points").textContent = state.points;
      renderWhoRow();
      renderMissions(s.missions || []);
      updateHomeHints();
      // help the second parent get in the first time (hidden once changed)
      $("gate-hint").classList.toggle("hidden", !s.pin_is_default);
    });
}

// ---------- missions (parent-assigned tests) ----------
function renderMissions(missions) {
  const list = $("mission-list");
  list.innerHTML = "";
  $("missions").classList.toggle("hidden", !missions.length);
  missions.forEach((m) => {
    const isSentences = m.mode === "sentences" || m.mode === "memory";
    const b = document.createElement("button");
    b.className = "mission-card";
    b.innerHTML =
      `<span class="mi-emoji">📋</span>` +
      `<span class="mi-text">${esc(MODE_LABELS[m.mode] || m.mode)}` +
      `<small>${isSentences ? esc(m.name)
        : `${esc(m.name)} · ${m.count} words`}</small></span>` +
      `<span class="mi-go">GO!</span>`;
    b.addEventListener("click", () => {
      state.mode = m.mode;
      state.assignment = m.id;
      startSession();
    });
    list.appendChild(b);
  });
}

// ---------- notifications (kid side) ----------
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  window.navigator.standalone === true;
const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window &&
  "Notification" in window;
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

function updateHomeHints() {
  // Not installed yet (iOS only pushes to Home-Screen apps): teach the
  // share-then-add move once; dismissible. Installed: offer the bell.
  const iosBrowser = /iPhone|iPad|iPod/.test(navigator.userAgent) && !isStandalone();
  $("install-hint").classList.toggle("hidden",
    !iosBrowser || !!lsGet("install-hint-x"));
  $("bell-btn").classList.toggle("hidden",
    !isStandalone() || !pushSupported() || !!lsGet("push-child") ||
    Notification.permission === "denied");
}

function urlB64ToU8(s) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function enablePush(role) {
  if (!pushSupported()) return { ok: false, why: "unsupported" };
  const perm = await Notification.requestPermission(); // must ride a tap
  if (perm !== "granted") return { ok: false, why: "denied" };
  const reg = await navigator.serviceWorker.ready;
  const key = (await api("/api/push/key")).key;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: urlB64ToU8(key) });
  }
  const body = { role, subscription: sub.toJSON(),
                 child: role === "child" ? state.childId : state.parentChild };
  if (role === "parent") body.pin = state.parentPin;
  await postJSON("/api/push/subscribe", body);
  lsSet("push-" + role, "1");
  return { ok: true };
}

// the "Who's spelling?" chips — only when there is more than one kid
function renderWhoRow() {
  const row = $("who-row");
  row.innerHTML = "";
  if (!state.children || state.children.length < 2) {
    row.classList.add("hidden");
    return;
  }
  row.classList.remove("hidden");
  state.children.forEach((c) => {
    const b = document.createElement("button");
    b.className = "who-chip" + (c.id === state.childId ? " active" : "");
    b.textContent = c.name;
    b.addEventListener("click", () => {
      if (c.id === state.childId) return;
      state.childId = c.id;
      storeChild(c.id);
      refreshState().catch(() => {});
    });
    row.appendChild(b);
  });
}

function boot() {
  // Wire everything first — buttons must work even if the network is slow.
  wireHome();
  wirePlay();
  wireDone();
  wireGate();
  wireParent();
  initUpdates();
  state.childId = storedChild();
  refreshState().catch(() => {});
}

// ---------- keeping the installed app fresh ----------
// An installed PWA keeps its page alive across app switches, so a new deploy
// can go unnoticed. We watch for it two ways — the service-worker update
// event, and polling /api/version (iOS home-screen apps don't always fire the
// SW event) — and show an "Update" bar the parent can tap to refresh. Works
// the same whether the app is served from the Pi or from HomeHub.
let bootVersion = null;
let updateShown = false;
let swReg = null;

function showUpdateBar() {
  if (updateShown) return;
  updateShown = true;
  $("update-bar").classList.remove("hidden");
  document.body.classList.add("has-update");
}

function initUpdates() {
  $("update-btn").addEventListener("click", doUpdate);

  api("/api/version").then((v) => { bootVersion = v.version; }).catch(() => {});

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      swReg = reg;
      // an update installed on a previous visit is already waiting
      if (reg.waiting && navigator.serviceWorker.controller) showUpdateBar();
      reg.addEventListener("updatefound", () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener("statechange", () => {
          // "installed" + an existing controller => this is an update, not
          // the first install, so it's safe to offer the refresh
          if (nw.state === "installed" && navigator.serviceWorker.controller) {
            showUpdateBar();
          }
        });
      });
    }).catch(() => {});

    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  // re-check whenever the app comes back to the foreground, plus a slow tick
  const recheck = () => {
    if (document.hidden) return;
    if (swReg) swReg.update().catch(() => {});
    api("/api/version").then((v) => {
      if (bootVersion && v.version && v.version !== bootVersion) showUpdateBar();
    }).catch(() => {});
  };
  document.addEventListener("visibilitychange", recheck);
  window.addEventListener("focus", recheck);
  setInterval(recheck, 60000);
}

function doUpdate() {
  $("update-btn").textContent = "Updating…";
  const hardReload = () => window.location.reload();
  // if a new worker is waiting, let it take over (its controllerchange
  // triggers the reload); otherwise just reload to pull fresh files.
  Promise.resolve(
    "serviceWorker" in navigator
      ? navigator.serviceWorker.getRegistration() : null
  ).then((reg) => {
    if (reg && reg.waiting) {
      reg.waiting.postMessage("SKIP_WAITING");
      setTimeout(hardReload, 1500); // fallback if controllerchange is slow
    } else {
      hardReload();
    }
  }).catch(hardReload);
}

// ---------- HOME ----------
function wireHome() {
  document.querySelectorAll(".mode-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      state.assignment = null; // free play, not a mission
      if (state.mode === "words" || state.mode === "listen") {
        chooseMode(btn); // ask how many — right under the tapped card
      } else {
        startSession(); // sentence modes jump straight in
      }
    });
  });
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      state.goal = parseInt(c.dataset.goal, 10);
      startSession();
    });
  });
  $("goal-back").addEventListener("click", resetHomeMenu);
  $("gear").addEventListener("click", openGate);

  $("install-hint-x").addEventListener("click", () => {
    lsSet("install-hint-x", "1");
    $("install-hint").classList.add("hidden");
  });
  $("bell-btn").addEventListener("click", async () => {
    try {
      const r = await enablePush("child");
      if (r.ok) {
        $("bell-btn").textContent = "🔔 Alerts are on!";
        setTimeout(() => $("bell-btn").classList.add("hidden"), 1500);
      } else {
        $("bell-btn").classList.add("hidden"); // denied: don't nag the kid
      }
    } catch (_) { $("bell-btn").classList.add("hidden"); }
  });
}

// Tap a word game -> the other games glide away (staggered) and the
// how-many chips pop in directly under the chosen card, so the question
// clearly belongs to the game he just picked. "⬅ All games" undoes it.
function chooseMode(card) {
  if (card.classList.contains("chosen")) return; // second tap: already asking
  document.querySelector(".mode-cards").classList.add("choosing");
  card.classList.add("chosen");
  const others = [...document.querySelectorAll(".mode-card:not(.chosen)")];
  others.forEach((c, i) => {
    c.style.transitionDelay = `${i * 45}ms`;
    c.classList.add("leaving");
  });
  setTimeout(() => {
    // faded out — now drop them from the layout so the chips close up
    others.forEach((c) => c.classList.add("off"));
    const row = $("goal-row");
    card.insertAdjacentElement("afterend", row);
    row.classList.remove("hidden");
    row.classList.add("pop-in");
  }, 280);
}

function resetHomeMenu() {
  const row = $("goal-row");
  row.classList.add("hidden");
  row.classList.remove("pop-in");
  const wrap = document.querySelector(".mode-cards");
  if (wrap) wrap.classList.remove("choosing");
  const cards = [...document.querySelectorAll(".mode-card")];
  cards.forEach((c) => c.classList.remove("chosen", "off"));
  // let display:none lift before un-fading, so the return animates
  requestAnimationFrame(() => cards.forEach((c, i) => {
    c.style.transitionDelay = `${i * 40}ms`;
    c.classList.remove("leaving");
    setTimeout(() => { c.style.transitionDelay = ""; }, 500);
  }));
}

// ---------- SESSION ----------
const isSentenceMode = () => state.mode === "sentences" || state.mode === "memory";

async function startSession() {
  unlockSpeech(); // still inside the start tap — lets auto-speak work on iOS
  // memory sentences are the hardest work, so fewer per session
  // (dictation guidance: 2-5 sentences/day; fewer for a struggling speller)
  const count = state.mode === "memory" ? 3
    : state.mode === "sentences" ? 6 : state.goal;
  let items = [];
  try {
    const data = await api(`/api/session?mode=${state.mode}&count=${count}` +
      `&child=${encodeURIComponent(state.childId)}` +
      (state.assignment ? `&assignment=${encodeURIComponent(state.assignment)}` : ""));
    // the mission may have been finished on another device — play it plain
    if (state.assignment && !data.assignment) state.assignment = null;
    items = data.items || [];
  } catch (_) {}
  if (!items.length) { alert("Could not load words. Try again."); return; }

  state.queue = items.slice();
  state.total = items.length;
  state.wordsDone = 0;
  state.correctCount = 0;
  state.earned = 0;
  state.levelUps = 0;
  state.finished = false;
  $("play-points").textContent = "+0";
  // memory (dictation) and listen (audio-only) NEED the speaker, so it
  // always shows in those modes regardless of the parent setting
  $("speaker").classList.toggle("hidden",
    !state.showSpeaker && state.mode !== "memory" && state.mode !== "listen");
  show("play");
  loadNext();
}

// Reset per-word UI: Check visible but disabled, Next hidden, feedback clear.
// Every path that presents a word to spell (new item, next sentence word,
// retry after a miss) MUST go through this so no path forgets a piece.
function resetItemUI() {
  state.answered = false;
  state.locked = false;
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("check").classList.remove("hidden");
  $("check").disabled = true;
  $("next").classList.add("hidden");
  $("next").textContent = "Next →";
}

function loadNext() {
  if (!state.queue.length) { finishSession(); return; }
  const item = state.queue.shift();
  state.missedThisItem = false;
  state.requeued = false;
  resetItemUI();

  const doneCount = state.total - state.queue.length - 1;
  $("progress-fill").style.width =
    Math.round((doneCount / Math.max(state.total, 1)) * 100) + "%";

  if (isSentenceMode()) {
    state.sentence = item;             // {s, tokens:[{display,answer}], wordIdx}
    if (item.wordIdx == null) item.wordIdx = 0;
    if (state.mode === "memory") setupMemory(item);
    else setupSentence(item);
  } else if (state.mode === "listen") {
    state.sentence = null;
    $("sentence-line").classList.add("hidden");
    state.itemStage = 3;
    beginListenWord(item.w);
    state.itemHeart = item.heart || null; // for the reveal after a miss
  } else {
    state.sentence = null;
    $("sentence-line").classList.add("hidden");
    presentWordItem(item);
  }
}

// Words mode is a LADDER: each word is presented at its own stage.
//   1 Copy it     — the word stays visible the whole time he types
//   2 From memory — hides at the first keystroke (look-cover-write-check)
//   3 From sound  — audio only, never shown (falls back to stage 2 if the
//                   parent turned the speaker off)
function presentWordItem(item) {
  const audioOk = state.showSpeaker && ("speechSynthesis" in window);
  const stage = Math.min(item.stage || 1, audioOk ? 3 : 2);
  state.itemStage = stage;
  if (stage >= 3) {
    beginListenWord(item.w);
    state.itemHeart = item.heart || null; // for the reveal after a miss
    $("prompt-hint").textContent = "You know this one — listen 🔊 and type it!";
  } else if (stage === 1) {
    const hint = item.heart
      ? "Heart word! The red part is the tricky bit ♥"
      : "New word! Copy it — it stays right here.";
    beginWord(item.w, hint, false, true, item.heart);
  } else {
    beginWord(item.w, "Look at the word, then type it!", false, false, item.heart);
  }
}

// ----- WORD MECHANIC (shared by both modes) -----
// display: what the kid sees (may carry capitals/punctuation, e.g. "bed.");
// the target he must type is always the cleaned, typeable form ("bed").
// Long words shrink so they never clip at the screen edges; short
// (landscape) viewports get a lower cap so the play column still fits.
function sizePrompt() {
  const pw = $("prompt-word");
  const len = Math.max((pw.textContent || "").length, 1);
  const room = Math.min(window.innerWidth, 640) - 110; // 110 ≈ speaker + padding
  const maxFs = vpHeight < 330 ? 30 : vpHeight < 540 ? 40 : 60;
  pw.style.fontSize =
    Math.max(28, Math.min(maxFs, Math.floor(room / (0.62 * len)))) + "px";
}

// Heart words: wrap the irregular grapheme(s) in .heart spans so they show
// red — "the part you learn by heart". heart is like "ai", "o-e", "oul";
// hyphen separates multiple graphemes, matched left-to-right in the word.
function heartSpans(display, heart) {
  if (!heart) return esc(display);
  const lower = display.toLowerCase();
  const ranges = [];
  let from = 0;
  for (const part of heart.toLowerCase().split("-")) {
    if (!part) continue;
    const i = lower.indexOf(part, from);
    if (i === -1) return esc(display); // mapping doesn't fit — show plain
    ranges.push([i, i + part.length]);
    from = i + part.length;
  }
  let out = "";
  let pos = 0;
  for (const [s, e] of ranges) {
    out += esc(display.slice(pos, s)) +
      `<span class="heart">${esc(display.slice(s, e))}</span>`;
    pos = e;
  }
  return out + esc(display.slice(pos));
}

function beginWord(display, hint, cased, keepVisible, heart) {
  // cased (sentence modes): capitals count — "The" must be typed as "The"
  state.caseSensitive = !!cased;
  state.keepVisible = !!keepVisible; // stage 1: don't hide while typing
  state.itemHeart = heart || null;
  state.target = cased ? cleanChars(display) : toTarget(display);
  $("prompt-hint").textContent = hint || "";
  const pw = $("prompt-word");
  pw.innerHTML = heartSpans(display, heart);
  sizePrompt();
  pw.classList.remove("gone");
  renderBoxes(state.target.length, "");
  const inp = $("typed");
  inp.value = "";
  inp.maxLength = state.target.length;
  // focus to raise the keyboard (works inside the tap gesture chain)
  setTimeout(() => inp.focus(), 30);
}

// Listen & Spell: the word is NEVER shown — he hears it and types it.
function beginListenWord(w) {
  state.caseSensitive = false;
  state.keepVisible = false;
  state.target = toTarget(w);
  const pw = $("prompt-word");
  pw.textContent = "";
  pw.classList.remove("gone");
  $("prompt-hint").textContent = "Listen 🔊 then type the word!";
  renderBoxes(state.target.length, "");
  const inp = $("typed");
  inp.value = "";
  inp.maxLength = state.target.length;
  setTimeout(() => inp.focus(), 30);
  speakCurrent(); // say it right away; the 🔊 button repeats it
}

function renderBoxes(n, value) {
  const wrap = $("boxes");
  wrap.className = "boxes";
  wrap.innerHTML = "";
  // The whole word must fit on ONE line — its shape is a memory cue.
  // Shrink boxes (and gaps) for long words instead of wrapping.
  const avail = wrap.clientWidth || wrap.parentElement.clientWidth || 340;
  let gap = 10;
  let size = Math.floor((avail - gap * (n - 1)) / n);
  if (size < 40) { gap = 6; size = Math.floor((avail - gap * (n - 1)) / n); }
  const maxBox = vpHeight < 330 ? 34 : vpHeight < 540 ? 42 : 52;
  size = Math.max(22, Math.min(maxBox, size));
  wrap.style.setProperty("--bs", size + "px");
  wrap.style.setProperty("--bg-gap", gap + "px");
  for (let i = 0; i < n; i++) {
    const b = document.createElement("div");
    b.className = "box" + (i < value.length ? " filled" : "");
    // the next empty box pulses so he can see where the letter will land
    if (i === value.length) b.className += " active";
    b.textContent = value[i] || "";
    wrap.appendChild(b);
  }
}

function onType() {
  if (state.answered || state.locked) return;
  const inp = $("typed");
  let val = cleanChars(inp.value);
  if (!state.caseSensitive) val = val.toLowerCase();
  inp.value = val;
  // hide the word the moment they start typing it (look–cover–write) —
  // except at stage 1 ("copy it"), where seeing it IS the exercise
  if (val.length >= 1 && !state.keepVisible) {
    $("prompt-word").classList.add("gone");
    if (state.mode === "sentences" && state.sentence && !state.curHidden) {
      state.curHidden = true;      // ...and hide it in the sentence line too
      renderCurrentSentence();
    }
  }
  renderBoxes(state.target.length, val);
  $("check").disabled = val.length !== state.target.length;
}

function doCheck() {
  if (state.answered || state.locked) return;
  const val = $("typed").value; // case matters in sentence modes
  const correct = val === state.target;
  const boxes = $("boxes");
  state.locked = true; // freeze typing while the result shows
  // keep the input focused (within this tap) so the keyboard stays open
  // through the whole session instead of bouncing between words
  $("typed").focus();

  if (correct) {
    state.answered = true;
    boxes.classList.add("correct");
    $("prompt-word").classList.remove("gone");
    $("feedback").textContent = pick(["Yes! 🌟", "Perfect! 🎉", "You got it! ✅", "Nice! 👏"]);
    $("feedback").className = "feedback good";
    // A retype right after the reveal is "aided": it earns the star but
    // shouldn't count toward accuracy or mastery.
    const aided = state.missedThisItem;
    postAnswer(state.target, true, aided);
    if (!aided) state.correctCount++;
    state.wordsDone++;
    state.points++;
    state.earned++;
    updatePointsUI();
    $("check").classList.add("hidden");
    if (state.sentence) {
      // show the completed word in the line right away
      state.curHidden = false;
      renderCurrentSentence();
      setTimeout(advanceSentenceWord, 700);
    } else {
      $("next").classList.remove("hidden");
      setTimeout(() => { if (!$("next").classList.contains("hidden")) advance(); }, 850);
    }
  } else {
    // wrong: reveal the word, let them study and try again
    if (!state.missedThisItem) postAnswer(state.target, false);
    state.missedThisItem = true;
    $("check").disabled = true; // no double-checking while the reveal loads
    boxes.classList.add("wrong");
    boxes.classList.add("shake");
    // right letters, wrong capitals → say so instead of a generic miss
    const caseOnly = state.caseSensitive &&
      val.toLowerCase() === state.target.toLowerCase();
    $("feedback").textContent = caseOnly
      ? "So close! Check the capital letter 🔠"
      : "Almost! Look again 👀";
    $("feedback").className = "feedback bad";
    // re-queue this word once, later in the session, for extra practice
    if (!state.requeued && (state.mode === "words" || state.mode === "listen")) {
      state.requeued = true;
      // re-present a rung down the ladder — the same drop the server records
      const back = { w: state.target, group: "",
                     stage: Math.max(1, (state.itemStage || 2) - 1),
                     heart: state.itemHeart || undefined };
      const pos = Math.min(state.queue.length, 2 + Math.floor(Math.random() * 3));
      state.queue.splice(pos, 0, back);
      state.total++;
    }
    setTimeout(() => {
      renderBoxes(state.target.length, state.target); // resets .boxes class...
      boxes.classList.add("reveal");                  // ...so add reveal after
      $("prompt-word").innerHTML = heartSpans(state.target, state.itemHeart);
      $("prompt-word").classList.remove("gone");
      $("prompt-hint").textContent = state.itemHeart
        ? "The red part is the tricky bit — learn it by heart ♥"
        : "This is how you spell it. Try again!";
      $("feedback").textContent = ""; // don't leave "Almost!" under the answer
      $("feedback").className = "feedback";
      $("check").classList.add("hidden");
      $("next").classList.remove("hidden");
      $("next").textContent = "Try again";
    }, 900);
  }
}

function advance() {
  // memory mode: "I'm ready!" flips from reading to typing from memory
  if (state.memorizing) { startMemoryTyping(); return; }
  // if this was a "try again" retry, re-present the same word
  if (state.missedThisItem && !state.answered) {
    resetItemUI();
    if (state.sentence) {
      const tok = state.sentence.tokens[state.sentence.wordIdx];
      // after a reveal the word is no secret — show it for the retype
      state.curHidden = false;
      renderCurrentSentence();
      beginWord(tok.display, "Try again — you can do it!", true, false, tok.heart);
    } else {
      beginWord(state.target, "Try again — you can do it!",
        false, false, state.itemHeart);
    }
    return;
  }
  loadNext();
}

// ----- SENTENCE MODES -----
// Fill-in ("sentences"): the WHOLE sentence stays visible. The word he's on
// is highlighted and stays readable until his first keystroke, then just
// that word hides and he fills it in. Sequential, word by word — he never
// has to remember more than the word he just looked at.
// Memory ("memory"): he reads (and can hear) the whole sentence, taps
// "I'm ready!", the whole sentence hides, and he types every word from
// memory. The speaker re-reads the sentence any time, like real dictation.

function setupSentence(item) {
  $("sentence-line").classList.remove("hidden");
  $("sentence-line").classList.remove("reading");
  advanceToTypableWord(item);
  state.curHidden = false; // current word stays visible until he types
  renderCurrentSentence();
  const tok = item.tokens[item.wordIdx];
  beginWord(tok.display, "Type the yellow word — it hides when you start!",
    true, false, tok.heart);
}

function setupMemory(item) {
  state.memorizing = true;
  const line = $("sentence-line");
  line.classList.remove("hidden");
  line.classList.add("reading");
  renderCurrentSentence(); // memorizing: every word shown
  const pw = $("prompt-word");
  pw.textContent = "";
  pw.classList.remove("gone");
  renderBoxes(0, "");
  state.locked = true;   // no typing during the read phase...
  $("typed").blur();     // ...and tuck the keyboard away for reading room
  $("prompt-hint").textContent = "Read the sentence. Tap 🔊 to hear it!";
  $("check").classList.add("hidden");
  $("next").classList.remove("hidden");
  $("next").textContent = "I'm ready!";
}

function startMemoryTyping() {
  state.memorizing = false;
  const item = state.sentence;
  $("sentence-line").classList.remove("reading");
  advanceToTypableWord(item);
  state.curHidden = true; // memory: the current word is never shown
  renderCurrentSentence();
  resetItemUI();
  beginMemoryWord();
}

// Present the current memory-mode word: boxes only, no visible word.
function beginMemoryWord() {
  const item = state.sentence;
  const tok = item.tokens[item.wordIdx];
  state.caseSensitive = true; // capitals count in sentences
  state.keepVisible = false;
  state.itemHeart = tok.heart || null; // for the reveal after a miss
  state.target = cleanChars(tok.display);
  const pw = $("prompt-word");
  pw.textContent = "";
  pw.classList.remove("gone");
  $("prompt-hint").textContent =
    `Word ${item.wordIdx + 1} of ${item.tokens.length} — you remember it!`;
  renderBoxes(state.target.length, "");
  const inp = $("typed");
  inp.value = "";
  inp.maxLength = state.target.length;
  setTimeout(() => inp.focus(), 30);
}

function advanceToTypableWord(item) {
  // skip tokens with no letters (rare — pure punctuation)
  while (item.wordIdx < item.tokens.length &&
         !item.tokens[item.wordIdx].answer) {
    item.wordIdx++;
  }
}

function renderCurrentSentence() {
  const item = state.sentence;
  const line = $("sentence-line");
  line.innerHTML = "";
  const blanks = (tok) => "_".repeat(Math.max(tok.answer.length, 1)) + " ";
  item.tokens.forEach((tok, i) => {
    const span = document.createElement("span");
    if (state.memorizing) {
      // memorize phase: the whole sentence, plainly readable
      span.className = "";
      span.textContent = tok.display + " ";
    } else if (i < item.wordIdx) {
      span.className = "done-word";
      span.textContent = tok.display + " ";
    } else if (i === item.wordIdx) {
      span.className = "cur-word";
      // visible until his first keystroke (fill-in), always hidden (memory)
      span.textContent = state.curHidden ? blanks(tok) : tok.display + " ";
    } else if (state.mode === "memory") {
      span.className = "blank-word";
      span.textContent = blanks(tok);
    } else {
      span.className = "todo-word"; // fill-in: coming words stay readable
      span.textContent = tok.display + " ";
    }
    line.appendChild(span);
  });
}

function advanceSentenceWord() {
  const item = state.sentence;
  // lock in the finished word
  item.wordIdx++;
  advanceToTypableWord(item);
  if (item.wordIdx >= item.tokens.length) {
    renderCurrentSentence();
    $("prompt-hint").textContent = "You spelled the whole sentence! 🎉";
    setTimeout(loadNext, 700);
    return;
  }
  state.missedThisItem = false;
  resetItemUI();
  if (state.mode === "memory") {
    state.curHidden = true;
    renderCurrentSentence();
    beginMemoryWord();
  } else {
    state.curHidden = false;
    renderCurrentSentence();
    const tok = item.tokens[item.wordIdx];
    beginWord(tok.display, "Next word!", true, false, tok.heart);
  }
}

// ----- results / finish -----
function updatePointsUI() {
  // during play the pill counts THIS session ("go earn 10 points" is the
  // family workflow) — the running total lives on the home screen
  $("play-points").textContent = "+" + state.earned;
  $("home-points").textContent = state.points;
  const pill = document.querySelector(".score-pill");
  if (pill) {
    pill.classList.remove("pop");
    void pill.offsetWidth; // restart the animation
    pill.classList.add("pop");
  }
}

function postAnswer(word, correct, aided) {
  postJSON("/api/answer",
    { word, correct, aided: !!aided, mode: state.mode, child: state.childId })
    .then((r) => {
      // the server's count is the truth — adopt it so devices never drift
      if (typeof r.points === "number") {
        state.points = r.points;
        $("home-points").textContent = state.points;
      }
      // the word climbed the ladder — tell him while the glow is fresh
      if (r.stage_up) {
        state.levelUps++;
        const fb = $("feedback");
        if (fb.className.includes("good")) fb.textContent += " ⬆️ Level up!";
      }
    })
    .catch(() => {});
}

function finishSession() {
  if (state.finished) return; // Next-tap and auto-advance can race here
  state.finished = true;
  $("check").classList.add("hidden");
  $("next").classList.add("hidden");
  const wasMission = state.assignment;
  postJSON("/api/session_end", {
    mode: state.mode,
    count: state.wordsDone,
    correct: state.correctCount,
    points: state.earned,
    child: state.childId,
    assignment: state.assignment || undefined,
  }).then((r) => {
    if (r.assignment_done) refreshState().catch(() => {}); // mission card gone
  }).catch(() => {});
  state.assignment = null;
  $("earned").textContent = state.earned;
  $("done-total").textContent = state.points;
  const lu = $("level-ups");
  lu.textContent = wasMission
    ? "📋✅ Mission complete!"
    : state.levelUps
      ? `⬆️ ${state.levelUps} word${state.levelUps === 1 ? "" : "s"} leveled up!`
      : "";
  show("done");
}

// ---------- PLAY wiring ----------
function wirePlay() {
  $("typed").addEventListener("input", onType);
  $("typed").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!$("check").disabled && !$("check").classList.contains("hidden")) {
      doCheck();
    } else if (!$("next").classList.contains("hidden")) {
      advance(); // Enter also works for "Next →" / "Try again"
    }
  });
  $("boxes").addEventListener("click", () => $("typed").focus());
  $("check").addEventListener("click", doCheck);
  $("next").addEventListener("click", advance);
  $("quit").addEventListener("click", () => { goHome(); });
  $("speaker").addEventListener("click", speakCurrent);
}

// ---------- speech (iOS-safe) ----------
// iOS Safari quirks handled here, each one earned the hard way:
// (1) speak() right after cancel() gets silently dropped — wait a beat;
// (2) the synth can come back PAUSED after an app switch — resume() first;
// (3) utterances are garbage-collected mid-speech unless referenced;
// (4) only gesture-initiated speech is allowed until one real utterance
//     runs inside a tap — startSession() burns its tap on unlockSpeech()
//     so auto-speak (Listen & Spell, ladder stage 3) works from word one.
// Note: the iPhone RING/SILENT switch mutes speech synthesis entirely —
// the pulsing speaker shows the app IS talking even when the phone is mute.
let currentUtterance = null;

function speakText(text) {
  const synth = window.speechSynthesis;
  if (!synth || !text) return;
  try { synth.resume(); } catch (_) {}
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.8;
  u.lang = "en-US";
  u.onstart = () => $("speaker").classList.add("speaking");
  u.onend = u.onerror = () => $("speaker").classList.remove("speaking");
  currentUtterance = u; // hold the reference (3)
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(() => { if (currentUtterance === u) synth.speak(u); }, 80);
  } else {
    synth.speak(u);
  }
}

function unlockSpeech() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    synth.speak(u); // inside the session-start tap — see (4) above
  } catch (_) {}
}

function speakCurrent() {
  if (!("speechSynthesis" in window)) return;
  let text = state.target;
  if (state.mode === "memory" && state.sentence) {
    text = state.sentence.s; // dictation: always the whole sentence
  } else if (state.mode === "sentences" && state.sentence) {
    const tok = state.sentence.tokens[state.sentence.wordIdx];
    if (!tok) return; // between the last word and the next sentence
    text = tok.answer;
  }
  speakText(text);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- viewport / keyboard management ----------
// iOS overlays the keyboard on the page instead of resizing it. We track
// the VISUAL viewport (the area actually visible above the keyboard), lay
// the app out inside it via --vvh, and compact the UI when it gets short —
// so the Check button always sits just above the keyboard, never under it.
let vpHeight = window.innerHeight;

function updateViewport() {
  const vv = window.visualViewport;
  vpHeight = vv ? Math.round(vv.height) : window.innerHeight;
  document.documentElement.style.setProperty("--vvh", vpHeight + "px");
  document.body.classList.toggle("compact", vpHeight < 540);
  document.body.classList.toggle("kb-tiny", vpHeight < 330);
  // iOS also pans the page to "reveal" the focused input; with the layout
  // already fitted to the visible area, pin it back to the top.
  if (window.scrollY > 0 || (vv && vv.offsetTop > 0)) window.scrollTo(0, 0);
  // re-fit the current word to the new size (not during result states —
  // renderBoxes would wipe the correct/wrong/reveal colors)
  if ($("play").classList.contains("active") && state.target) {
    sizePrompt();
    const wrap = $("boxes");
    if (!/correct|wrong|reveal/.test(wrap.className)) {
      renderBoxes(state.target.length, $("typed").value);
    }
  }
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewport);
  window.visualViewport.addEventListener("scroll", updateViewport);
}
window.addEventListener("resize", updateViewport);
updateViewport();

// ---------- DONE ----------
function wireDone() {
  $("again").addEventListener("click", startSession); // same game, same goal
  $("home-btn").addEventListener("click", goHome);
}

function goHome() {
  $("home-points").textContent = state.points;
  resetHomeMenu(); // full menu again, chips tucked away
  state.assignment = null; // quitting a mission leaves it on the list
  refreshState().catch(() => {});
  state.sentence = null;
  state.memorizing = false;
  currentUtterance = null;
  window.speechSynthesis && window.speechSynthesis.cancel();
  $("speaker").classList.remove("speaking");
  show("home");
}

// ---------- PARENT GATE ----------
let pinEntry = "";
function openGate() {
  pinEntry = "";
  renderPinDots();
  $("pin-err").textContent = "";
  show("gate");
}
// PINs are 4-8 digits, so the dots grow with the entry (min 4 shown).
function renderPinDots() {
  const wrap = $("pin-dots");
  const slots = Math.max(4, Math.min(8, pinEntry.length + (pinEntry.length >= 4 ? 1 : 0)));
  while (wrap.children.length < slots) wrap.appendChild(document.createElement("i"));
  while (wrap.children.length > slots) wrap.removeChild(wrap.lastChild);
  [...wrap.children].forEach((d, i) => d.classList.toggle("on", i < pinEntry.length));
}
function wireGate() {
  document.querySelectorAll(".pin-key").forEach((k) => {
    k.addEventListener("click", async () => {
      if (k.classList.contains("del")) {
        pinEntry = pinEntry.slice(0, -1);
      } else if (pinEntry.length < 8) {
        pinEntry += k.textContent;
        $("pin-err").textContent = "";
      }
      renderPinDots();
      if (pinEntry.length < 4) return;
      const attempt = pinEntry;
      try {
        const r = await postJSON("/api/parent/login", { pin: attempt });
        if (pinEntry !== attempt) return; // entry changed while we waited
        if (r.ok) {
          state.parentPin = attempt;
          openParent();
        } else if (r.final || attempt.length >= 8) {
          // typing more digits can't make this entry right — it's wrong
          flashPinError();
        }
        // otherwise: the real PIN is longer; keep letting them type
      } catch (_) {
        if (pinEntry === attempt && attempt.length >= 8) flashPinError();
      }
    });
  });
  document.querySelectorAll("[data-home]").forEach((b) =>
    b.addEventListener("click", goHome));
}
function flashPinError() {
  $("pin-err").textContent = "Wrong PIN — try again.";
  pinEntry = "";
  renderPinDots();
}

// ---------- PARENT DASHBOARD ----------
async function openParent() {
  show("parent");
  try {
    const who = state.parentChild || state.childId;
    const rep = await api(
      "/api/parent/report?child=" + encodeURIComponent(who),
      { headers: { "X-Parent-Pin": state.parentPin } });
    state.parentChild = rep.child;
    state.children = rep.children || state.children;
    renderReport(rep);
  } catch (_) {
    alert("Could not load the report.");
    goHome();
  }
}

// one tab per kid at the top of the dashboard — everything below (stats,
// word lists, settings) belongs to the selected child only
function renderChildTabs(children, current) {
  const row = $("child-tabs");
  row.innerHTML = "";
  (children || []).forEach((c) => {
    const b = document.createElement("button");
    b.className = "child-tab" + (c.id === current ? " active" : "");
    b.innerHTML = `${esc(c.name)} <span class="ct-pts">${c.points}⭐</span>`;
    b.addEventListener("click", () => {
      if (c.id === state.parentChild) return;
      state.parentChild = c.id;
      openParent();
    });
    row.appendChild(b);
  });
  const add = document.createElement("button");
  add.className = "child-tab add";
  add.textContent = "+ Add child";
  add.addEventListener("click", async () => {
    const name = (prompt("Child's name?") || "").trim();
    if (!name) return;
    try {
      const r = await postJSON("/api/parent/children",
        { pin: state.parentPin, action: "add", name });
      state.parentChild = r.child;   // jump straight to the new kid
      await openParent();
      refreshState().catch(() => {}); // home picker learns about them too
    } catch (_) {
      alert("Could not add the child — check your connection.");
    }
  });
  row.appendChild(add);
}

function renderReport(rep) {
  renderChildTabs(rep.children, rep.child);
  $("s-points").textContent = rep.summary.points;
  $("s-accuracy").textContent = rep.summary.accuracy + "%";
  $("s-words").textContent = rep.summary.words_practiced;
  $("s-sessions").textContent = rep.summary.sessions;
  $("s-mastered").textContent = rep.summary.mastered ?? 0;
  $("s-learning").textContent = rep.summary.learning ?? 0;

  // the learning journey — progress a parent can feel good about
  const journey = rep.journey || {};
  const jl = $("journey-list");
  jl.innerHTML = "";
  const rungs = [
    ["mastered", "★ Mastered", "var(--green)"],
    ["sound", "🔊 From sound", "var(--blue)"],
    ["memory", "✏️ From memory", "var(--amber)"],
    ["copy", "🐣 Copying", "#d9cfc0"],
  ];
  const jTotal = Math.max(1, rungs.reduce((n, [k]) => n + (journey[k] || 0), 0));
  rungs.forEach(([k, label, color]) => {
    const n = journey[k] || 0;
    const li = document.createElement("li");
    li.innerHTML = `<span class="j-label">${label}</span>` +
      `<span class="journey-bar"><span class="journey-fill" style="width:${Math.round(100 * n / jTotal)}%;background:${color}"></span></span>` +
      `<span class="j-count">${n}</span>`;
    jl.appendChild(li);
  });
  $("j-week").textContent = rep.summary.mastered_this_week
    ? `${rep.summary.mastered_this_week} mastered this week! 🎉` : "";

  const ml = $("missed-list");
  ml.innerHTML = "";
  if (!rep.most_missed.length) {
    ml.innerHTML = '<li class="muted">No misses yet — nice!</li>';
  } else {
    rep.most_missed.forEach((m) => {
      const li = document.createElement("li");
      const left = document.createElement("span");
      left.innerHTML = `<span class="missed-word">${esc(m.word)}</span>` +
        (m.mastered ? '<span class="badge">learned</span>' : "");
      const right = document.createElement("span");
      right.className = "miss-count";
      right.textContent = "missed " + m.missed + "×";
      li.appendChild(left); li.appendChild(right);
      ml.appendChild(li);
    });
  }

  // last practiced — friendly relative time
  const lp = rep.last_practice_ts || 0;
  let lpText = "never";
  if (lp) {
    const ago = Math.floor(Date.now() / 1000) - lp;
    if (ago < 90) lpText = "just now";
    else if (ago < 3600) lpText = Math.round(ago / 60) + " minutes ago";
    else if (ago < 86400) lpText = Math.round(ago / 3600) + " hours ago";
    else lpText = new Date(lp * 1000).toLocaleDateString(undefined,
      { weekday: "short", month: "short", day: "numeric" });
  }
  $("s-last").textContent = lpText;

  // day-by-day history — each day is its own row, never merged
  const dl = $("daily-list");
  dl.innerHTML = "";
  if (!rep.daily || !rep.daily.length) {
    dl.innerHTML = '<li class="muted">No practice days yet.</li>';
  } else {
    rep.daily.forEach((d) => {
      const li = document.createElement("li");
      const nice = new Date(d.date + "T12:00:00").toLocaleDateString(undefined,
        { weekday: "short", month: "short", day: "numeric" });
      li.innerHTML = `<span>${nice}</span>` +
        `<span>${d.seen} words · ${d.accuracy}% · ${d.points} ⭐</span>`;
      dl.appendChild(li);
    });
  }

  const modeLabels = {
    words: "Spell Words", listen: "Listen & Spell",
    sentences: "Spell Sentences", memory: "Memory Sentences",
  };
  const bm = rep.by_mode || {};
  const mml = $("modes-list");
  mml.innerHTML = "";
  const activeModes = Object.keys(modeLabels)
    .filter((k) => bm[k] && (bm[k].seen > 0 || bm[k].points > 0));
  if (!activeModes.length) {
    mml.innerHTML = '<li class="muted">Nothing yet.</li>';
  } else {
    activeModes.forEach((k) => {
      const m = bm[k];
      const acc = m.seen ? Math.round((100 * m.correct) / m.seen) : 0;
      const li = document.createElement("li");
      li.innerHTML = `<span class="mode-name">${modeLabels[k]}</span>` +
        `<span class="mode-meta">${m.seen} tries · ${acc}% right · ` +
        `${m.sessions} session${m.sessions === 1 ? "" : "s"} · ${m.points} ⭐</span>`;
      mml.appendChild(li);
    });
  }

  const sl = $("sessions-list");
  sl.innerHTML = "";
  if (!rep.recent_sessions.length) {
    sl.innerHTML = '<li class="muted">Nothing yet.</li>';
  } else {
    rep.recent_sessions.forEach((s) => {
      const li = document.createElement("li");
      const when = new Date(s.ts * 1000).toLocaleDateString(undefined,
        { month: "short", day: "numeric" });
      li.innerHTML = `<span>${when} · ${esc(s.mode)}</span>` +
        `<span>${s.correct}/${s.count} right</span>`;
      sl.appendChild(li);
    });
  }

  // word sources: the custom lists first (the bank's copy-target dropdown
  // needs them cached), then the bank with its grade bands
  renderAssignments(rep);
  renderProgress(rep.progress);
  renderLists(rep.lists || []);
  renderBank(rep.bank);
  $("hearts-only").checked = rep.profile.hearts_only === true;
  updateHeartsNote(rep.hearts_in_pool);
  updateNoWordsNote(rep.sources_empty);

  $("set-name").value = rep.profile.name || "";
  $("set-speaker").checked = rep.profile.show_speaker !== false;
  $("set-pin").value = "";
  $("settings-saved").textContent = "";
  if (lsGet("push-parent")) $("notif-btn").textContent = "🔔 On for this device ✓";
  // a child can be removed only while a sibling remains
  const rc = $("remove-child");
  rc.classList.toggle("hidden", (rep.children || []).length < 2);
  rc.textContent = `Remove ${rep.profile.name || "this child"}…`;
}

// ---------- Assignments (parent hands out missions) ----------
function renderAssignments(rep) {
  const sel = $("assign-list");
  sel.innerHTML = '<option value="">his checked words</option>' +
    (rep.lists || []).map((l) =>
      `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join("");
  const a = rep.assignments || { todo: [], done: [] };
  const open = $("assign-open");
  open.innerHTML = a.todo.length ? "" :
    '<div class="muted" style="padding:6px 2px">Nothing assigned right now.</div>';
  a.todo.forEach((t) => {
    const row = document.createElement("div");
    row.className = "assign-row";
    row.innerHTML =
      `<span class="ar-what">📋 ${esc(MODE_LABELS[t.mode] || t.mode)} — ` +
      `${esc(t.name)}</span><span class="ar-meta">waiting</span>` +
      `<button class="wr-x" aria-label="cancel">✕</button>`;
    row.querySelector(".wr-x").addEventListener("click", () =>
      assignCall({ action: "delete", assignment_id: t.id }));
    open.appendChild(row);
  });
  const doneWrap = $("assign-done");
  doneWrap.innerHTML = "";
  a.done.forEach((t) => {
    const r = t.result || { correct: 0, count: 0 };
    const row = document.createElement("div");
    row.className = "assign-row done";
    row.innerHTML =
      `<span class="ar-what">✅ ${esc(MODE_LABELS[t.mode] || t.mode)} — ` +
      `${esc(t.name)}</span>` +
      `<span class="ar-meta"><b>${r.correct}/${r.count}</b> · ${fmtAgo(t.done_ts)}</span>` +
      `<button class="wr-x" aria-label="clear">✕</button>`;
    row.querySelector(".wr-x").addEventListener("click", () =>
      assignCall({ action: "delete", assignment_id: t.id }));
    doneWrap.appendChild(row);
  });
}

async function assignCall(body) {
  try {
    await postJSON("/api/parent/assign",
      { pin: state.parentPin, child: state.parentChild, ...body });
    await openParent(); // assignments, tiles, everything refreshes
  } catch (_) {
    $("custom-status").textContent = "Could not update the assignment.";
  }
}

// ---------- Results by list (the spelling-test view) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDay(iso) {           // "2026-07-02" -> "Jul 2"
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}
function fmtAgo(ts) {
  if (!ts) return "";
  const days = Math.floor((Date.now() / 1000 - ts) / 86400);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  const d = new Date(ts * 1000);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// One group's results — a school list (resettable) or a grade band.
function progressEntry(e, label, listId) {
  const div = document.createElement("div");
  div.className = "prog-entry";
  const pct = e.total ? Math.round(100 * e.mastered / e.total) : 0;
  let html =
    `<div class="prog-top"><span class="prog-name">${esc(label)}</span>` +
    (listId ? `<button class="prog-reset">start over</button>` : "") +
    `<span class="prog-count">★ ${e.mastered}/${e.total}</span></div>` +
    `<div class="prog-bar"><span style="width:${pct}%"></span></div>`;
  if (!e.practiced) {
    html += `<div class="prog-meta muted">Not practiced yet.</div>`;
  } else {
    html += `<div class="prog-meta">${e.accuracy}% right unaided · ` +
      `${e.practiced} of ${e.total} tried · last ${fmtAgo(e.last_ts)}</div>`;
    if (e.trend && e.trend.length) {
      html += `<div class="prog-trend">` + e.trend.slice(-5).map((t) =>
        `<span class="pt-day">${fmtDay(t.date)} <b>${t.correct}/${t.seen}</b></span>`
      ).join("") + `</div>`;
    }
    if (e.trouble && e.trouble.length) {
      html += `<div class="prog-trouble">Still tricky: ` + e.trouble.map((t) =>
        `<span class="wr-miss">${esc(t.word)} ✗${t.missed}</span>`
      ).join("&ensp;") + `</div>`;
    }
  }
  div.innerHTML = html;
  const rb = div.querySelector(".prog-reset");
  if (rb) rb.addEventListener("click", async () => {
    if (!confirm(`Start "${label}" over? Progress on its words goes back to zero (stars are kept).`)) return;
    try {
      await listsCall({ action: "reset_list", list_id: listId });
      await openParent();   // results + journey + tiles all change
    } catch (_) { listsFail(); }
  });
  return div;
}

function renderProgress(prog) {
  const wrap = $("progress-lists");
  wrap.innerHTML = "";
  if (!prog) return;
  if (!prog.lists.length) {
    wrap.innerHTML = '<div class="muted" style="padding:6px 2px">' +
      "Results appear here once a school list is added below.</div>";
  }
  prog.lists.forEach((e) => wrap.appendChild(progressEntry(e, e.name, e.id)));
  const bw = $("progress-bands");
  bw.innerHTML = "";
  $("progress-bands-wrap").classList.toggle("hidden", !prog.bands.length);
  prog.bands.forEach((e) => bw.appendChild(progressEntry(e, gradeLabel(e.level))));
}

// ---------- Word lists (the parent picks what he practices) ----------
const STAGE_TAGS = { 1: "copying", 2: "from memory", 3: "from sound" };

// the ♥ shown to the right of a heart word in the word rows
function heartMark() {
  return ' <span class="wr-heart" title="heart word">♥</span>';
}

// The "everything is unchecked" heads-up: unchecking every band/list is
// allowed and sticks (predictable checkboxes) — this just says what happens.
function updateNoWordsNote(empty) {
  if (typeof empty === "boolean") {
    $("no-words-note").classList.toggle("hidden", !empty);
  }
}

// "Heart words only" narrows practice to the heart words inside whatever
// sources are checked below. The note shows how many words that gives.
let heartsInPool = null;
function updateHeartsNote(n) {
  if (typeof n === "number") heartsInPool = n;
  if (heartsInPool === null) return;
  $("hearts-note").textContent = $("hearts-only").checked
    ? `practicing ${heartsInPool}` : `${heartsInPool} available`;
}


// The built-in bank: like the custom lists (checkboxes down to single
// words) except PERMANENT — grades and their words can be switched off but
// never deleted. Each grade band can also be copied into a custom list, so
// a school list can be built without typing.
let cachedLists = [];

function renderBank(bank) {
  const wrap = $("bank-wrap");
  if (!bank) { wrap.innerHTML = ""; return; }
  const wasOpen = !!wrap.querySelector("details.wlist[open]");
  const openBands = new Set(
    [...wrap.querySelectorAll("details.band[open]")].map((d) => d.dataset.level));
  wrap.innerHTML = "";
  const det = document.createElement("details");
  // "src-off" greys the contents when the source is switched off — the
  // checkmarks inside are REMEMBERED (grey, not lost) and come back live
  // when the source is re-enabled
  det.className = "wlist" + (bank.enabled ? "" : " src-off");
  if (wasOpen) det.open = true;

  const sum = document.createElement("summary");
  sum.innerHTML = `<span class="tri">▶</span>` +
    `<input type="checkbox" id="bank-enabled" ${bank.enabled ? "checked" : ""}` +
    ` aria-label="use the word bank">` +
    `<span class="list-name">Word bank</span>` +
    `<span class="list-count" id="bank-count">${bank.enabled_count}:${bank.total}</span>`;
  const master = sum.querySelector("input");
  master.addEventListener("click", (e) => e.stopPropagation());
  master.addEventListener("change", () => {
    det.classList.toggle("src-off", !master.checked);
    postJSON("/api/parent/settings",
      { pin: state.parentPin, child: state.parentChild,
        bank_enabled: master.checked })
      .then((r) => {
        updateNoWordsNote(r.sources_empty);
        $("custom-status").textContent = "";
      })
      .catch(listsFail);
  });
  det.appendChild(sum);

  const body = document.createElement("div");
  body.className = "wlist-body bank-body";
  bank.bands.forEach((band) => {
    const bd = document.createElement("details");
    // an unchecked band keeps its word checkmarks, shown grey: re-checking
    // the band re-activates exactly the words that were checked before
    bd.className = "band" + (band.enabled ? "" : " src-off");
    bd.dataset.level = String(band.level);
    if (openBands.has(String(band.level))) bd.open = true;

    const bsum = document.createElement("summary");
    bsum.innerHTML = `<span class="tri">▶</span>` +
      `<input type="checkbox" ${band.enabled ? "checked" : ""}` +
      ` aria-label="include this grade">` +
      `<span class="list-name">${gradeLabel(band.level)}</span>` +
      `<span class="list-count">${band.enabled_count}:${band.total}</span>`;
    const bcb = bsum.querySelector("input");
    bcb.addEventListener("click", (e) => e.stopPropagation());
    bcb.addEventListener("change", () => {
      bd.classList.toggle("src-off", !bcb.checked); // grey instantly
      listsCall({ action: "bank_toggle_band", level: band.level,
                  enabled: bcb.checked }).catch(listsFail);
    });
    bd.appendChild(bsum);

    const bbody = document.createElement("div");
    bbody.className = "wlist-body";
    const rows = document.createElement("div");
    rows.className = "word-rows";
    band.words.forEach((it) => {
      const row = document.createElement("div");
      row.className = "word-row" +
        (it.stage >= 4 ? " st-mastered" : "") + (it.on ? "" : " off");
      const status = it.stage >= 4 ? "★ mastered"
        : it.stage >= 1 ? STAGE_TAGS[it.stage] : "";
      row.innerHTML =
        `<input type="checkbox" ${it.on ? "checked" : ""}` +
        ` aria-label="practice this word">` +
        `<span class="wr-word">${esc(it.word)}${it.heart ? heartMark() : ""}</span>` +
        `<span class="wr-status">${status}</span>`;
      const wcb = row.querySelector("input");
      wcb.addEventListener("change", () => {
        listsCall({ action: "bank_toggle_word", word: it.word,
                    enabled: wcb.checked }).catch(listsFail);
      });
      rows.appendChild(row);
    });
    bbody.appendChild(rows);

    // copy this grade's checked words into a custom list — no typing
    const copy = document.createElement("div");
    copy.className = "wlist-actions";
    const opts = cachedLists.map((l) =>
      `<option value="${esc(l.id)}">into: ${esc(l.name)}</option>`).join("");
    copy.innerHTML =
      `<select aria-label="copy target">` +
      `<option value="">as a new list</option>${opts}</select>` +
      `<button class="mini-btn">Copy words</button>`;
    copy.querySelector("button").addEventListener("click", () => {
      const target = copy.querySelector("select").value;
      listsCall({ action: "bank_copy", level: band.level,
                  list_id: target || undefined,
                  name: gradeLabel(band.level) + " words" }).catch(listsFail);
    });
    bbody.appendChild(copy);
    bd.appendChild(bbody);
    body.appendChild(bd);
  });
  det.appendChild(body);
  wrap.appendChild(det);
}

function listsFail() {
  $("custom-status").textContent = "Could not update — check your connection.";
}

async function listsCall(body) {
  const r = await postJSON("/api/parent/lists",
    { pin: state.parentPin, child: state.parentChild, ...body });
  renderLists(r.lists);
  if (r.bank) renderBank(r.bank);
  updateHeartsNote(r.hearts_in_pool);
  updateNoWordsNote(r.sources_empty);
  $("custom-status").textContent = "";
  return r;
}

// lists: [{id, name, enabled, total, enabled_count, mastered,
//          words: [{word, on, stage, seen, missed}]}]
function renderLists(lists) {
  cachedLists = lists || []; // the bank's copy-target dropdown reads this
  const wrap = $("lists-wrap");
  // keep lists the parent opened open across re-renders
  const openIds = new Set(
    [...wrap.querySelectorAll("details[open]")].map((d) => d.dataset.id));
  wrap.innerHTML = "";
  if (!lists || !lists.length) {
    wrap.innerHTML =
      '<div class="muted" style="padding:10px 2px">No school lists yet — add one below.</div>';
    return;
  }
  lists.forEach((l) => {
    const det = document.createElement("details");
    // same rule as the bank: a switched-off list keeps its checkmarks grey
    det.className = "wlist" + (l.enabled ? "" : " src-off");
    det.dataset.id = l.id;
    if (openIds.has(l.id)) det.open = true;

    const sum = document.createElement("summary");
    sum.innerHTML = `<span class="tri">▶</span>` +
      `<input type="checkbox" ${l.enabled ? "checked" : ""} aria-label="use this list">` +
      `<span class="list-name">${esc(l.name)}</span>` +
      `<span class="list-count">${l.enabled_count}:${l.total}` +
      (l.mastered ? ` <span class="mastered-n">★${l.mastered}</span>` : "") +
      `</span>`;
    const cb = sum.querySelector("input");
    cb.addEventListener("click", (e) => e.stopPropagation());
    cb.addEventListener("change", () => {
      det.classList.toggle("src-off", !cb.checked); // grey instantly
      listsCall({ action: "toggle_list", list_id: l.id, enabled: cb.checked })
        .catch(listsFail);
    });
    det.appendChild(sum);

    const body = document.createElement("div");
    body.className = "wlist-body";
    // plain utility list: one word per row, checkbox = practice it or not
    const rows = document.createElement("div");
    rows.className = "word-rows";
    l.words.forEach((it) => {
      const row = document.createElement("div");
      row.className = "word-row" +
        (it.stage >= 4 ? " st-mastered" : it.stage >= 1 ? " st-learning" : "") +
        (it.on ? "" : " off");
      const status = it.stage >= 4 ? "★ mastered"
        : it.stage >= 1 ? STAGE_TAGS[it.stage] : "not tried";
      const miss = it.missed > 0
        ? ` <span class="wr-miss">✗${it.missed}</span>` : "";
      row.innerHTML =
        `<input type="checkbox" ${it.on ? "checked" : ""} aria-label="practice this word">` +
        `<span class="wr-word">${esc(it.word)}${it.heart ? heartMark() : ""}</span>` +
        `<span class="wr-status">${status}${miss}</span>` +
        `<button class="wr-x" aria-label="remove">✕</button>`;
      const wcb = row.querySelector("input");
      wcb.addEventListener("change", () => {
        listsCall({ action: "toggle_word", list_id: l.id,
                    word: it.word, enabled: wcb.checked }).catch(listsFail);
      });
      row.querySelector(".wr-x").addEventListener("click", () => {
        listsCall({ action: "remove_word", list_id: l.id, word: it.word })
          .catch(listsFail);
      });
      rows.appendChild(row);
    });
    body.appendChild(rows);

    const actions = document.createElement("div");
    actions.className = "wlist-actions";
    actions.innerHTML =
      `<input type="text" placeholder="Add words to this list"
         autocomplete="off" autocapitalize="none" spellcheck="false">` +
      `<button class="mini-btn">Add</button>` +
      `<button class="mini-btn danger">Delete</button>`;
    const inp = actions.querySelector("input");
    const [addB, delB] = actions.querySelectorAll("button");
    addB.addEventListener("click", () => {
      if (!inp.value.trim()) return;
      listsCall({ action: "add_words", list_id: l.id, words: inp.value })
        .catch(listsFail);
    });
    delB.addEventListener("click", () => {
      if (!confirm(`Delete the list "${l.name}"?`)) return;
      listsCall({ action: "delete", list_id: l.id }).catch(listsFail);
    });
    body.appendChild(actions);
    det.appendChild(body);
    wrap.appendChild(det);
  });
}

const ORDINAL = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"];
function gradeLabel(v) {
  const g = Math.floor(v);
  const half = v - g >= 0.5;
  return ORDINAL[g - 1] + " grade" + (g === 9 ? "" : half ? " · later" : " · early");
}

function wireParent() {
  $("assign-mode").addEventListener("change", () => {
    // sentence tests come from the sentence bank, not a word list
    const m = $("assign-mode").value;
    $("assign-list").disabled = m === "sentences" || m === "memory";
  });
  $("assign-create").addEventListener("click", () => {
    assignCall({ action: "create",
                 mode: $("assign-mode").value,
                 list_id: $("assign-list").value || undefined,
                 all_children: $("assign-all").checked || undefined });
  });

  $("notif-btn").addEventListener("click", async () => {
    const note = $("notif-note");
    if (!isStandalone() && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      note.textContent = "First add the app to your Home Screen: Share ⬆️ → \"Add to Home Screen\" — then tap this again.";
      return;
    }
    try {
      const r = await enablePush("parent");
      note.textContent = r.ok
        ? "This device gets a ping when a mission is finished ✓"
        : r.why === "denied"
          ? "Notifications are blocked — allow them in Settings for this app."
          : "This browser can't do notifications — try the installed app.";
      if (r.ok) $("notif-btn").textContent = "🔔 On for this device ✓";
    } catch (_) {
      note.textContent = "Could not turn notifications on — try again.";
    }
  });

  $("hearts-only").addEventListener("change", () => {
    updateHeartsNote();
    postJSON("/api/parent/settings",
      { pin: state.parentPin, child: state.parentChild,
        hearts_only: $("hearts-only").checked })
      .then(() => { $("custom-status").textContent = ""; })
      .catch(listsFail);
  });

  $("custom-add").addEventListener("click", async () => {
    const val = $("custom-input").value.trim();
    if (!val) return;
    try {
      await listsCall({ action: "create",
                        name: $("list-name").value.trim(), words: val });
      $("custom-input").value = "";
      $("list-name").value = "";
    } catch (_) {
      listsFail();
    }
  });

  $("save-settings").addEventListener("click", async () => {
    const body = {
      pin: state.parentPin,
      child: state.parentChild,
      name: $("set-name").value,
      show_speaker: $("set-speaker").checked,
    };
    const newPin = $("set-pin").value.trim();
    if (newPin) {
      if (!/^\d{4,8}$/.test(newPin)) {
        $("settings-saved").textContent = "PIN must be 4-8 digits.";
        return;
      }
      body.new_pin = newPin;
    }
    try {
      const r = await postJSON("/api/parent/settings", body);
      // only adopt the new PIN once the server confirms it took
      if (r.pin_changed) {
        state.parentPin = newPin;
        $("set-pin").value = "";
      }
      $("settings-saved").textContent = "Saved ✓";
      // a rename shows up in the tabs and (if it's this device's kid) at home
      refreshState().catch(() => {});
      const tab = [...document.querySelectorAll("#child-tabs .child-tab")]
        .find((t) => t.classList.contains("active"));
      if (tab && body.name.trim()) {
        tab.firstChild.textContent = body.name.trim() + " ";
      }
    } catch (_) {
      $("settings-saved").textContent = "Could not save.";
    }
  });

  $("reset-stars").addEventListener("click", async () => {
    const name = $("set-name").value || "this child";
    if (!confirm(`Set ${name}'s stars back to 0? (Practice progress is kept.)`)) return;
    try {
      await postJSON("/api/parent/settings",
        { pin: state.parentPin, child: state.parentChild, reset_points: true });
      await openParent();
      refreshState().catch(() => {});
    } catch (_) {
      $("settings-saved").textContent = "Could not reset.";
    }
  });

  $("reset-progress").addEventListener("click", async () => {
    const name = $("set-name").value || "this child";
    if (!confirm(`Reset ALL of ${name}'s practice progress? Every word starts over. ` +
                 "Stars, word lists, and settings are kept. This can't be undone.")) return;
    try {
      await postJSON("/api/parent/settings",
        { pin: state.parentPin, child: state.parentChild, reset_progress: true });
      await openParent();
      refreshState().catch(() => {});
    } catch (_) {
      $("settings-saved").textContent = "Could not reset.";
    }
  });

  $("remove-child").addEventListener("click", async () => {
    const name = $("set-name").value || "this child";
    if (!confirm(`Remove ${name} and ALL their progress? This can't be undone.`)) return;
    try {
      const r = await postJSON("/api/parent/children",
        { pin: state.parentPin, action: "delete", child: state.parentChild });
      state.parentChild = r.child;
      await openParent();
      refreshState().catch(() => {});
    } catch (_) {
      alert("Could not remove the child.");
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

boot();
