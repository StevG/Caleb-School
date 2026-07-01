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
// word bank and custom-word cleaning follow the same rule.
const toTarget = (s) => s.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
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
  sentence: null, // {tokens, wordIdx} when in sentence mode
};

// ---------- boot ----------
function boot() {
  // Wire everything first — buttons must work even if the network is slow.
  wireHome();
  wirePlay();
  wireDone();
  wireGate();
  wireParent();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
  api("/api/state").then((s) => {
    state.points = s.points || 0;
    state.showSpeaker = s.show_speaker !== false;
    $("kid-name").textContent = s.name || "Caleb";
    $("home-points").textContent = state.points;
  }).catch(() => {});
}

// ---------- HOME ----------
function wireHome() {
  document.querySelectorAll(".mode-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      if (state.mode === "words") {
        $("goal-row").classList.remove("hidden");
      } else {
        startSession(); // sentences: jump straight in
      }
    });
  });
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      state.goal = parseInt(c.dataset.goal, 10);
      startSession();
    });
  });
  $("gear").addEventListener("click", openGate);
}

// ---------- SESSION ----------
async function startSession() {
  const count = state.mode === "sentences" ? 6 : state.goal;
  let items = [];
  try {
    const data = await api(`/api/session?mode=${state.mode}&count=${count}`);
    items = data.items || [];
  } catch (_) {}
  if (!items.length) { alert("Could not load words. Try again."); return; }

  state.queue = items.slice();
  state.total = items.length;
  state.wordsDone = 0;
  state.correctCount = 0;
  state.earned = 0;
  state.finished = false;
  $("play-points").textContent = state.points;
  $("speaker").classList.toggle("hidden", !state.showSpeaker);
  show("play");
  loadNext();
}

// Reset per-word UI: Check visible but disabled, Next hidden, feedback clear.
// Every path that presents a word to spell (new item, next sentence word,
// retry after a miss) MUST go through this so no path forgets a piece.
function resetItemUI() {
  state.answered = false;
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

  if (state.mode === "sentences") {
    state.sentence = item;             // {s, tokens:[{display,answer}], wordIdx}
    if (item.wordIdx == null) item.wordIdx = 0;
    setupSentence(item);
  } else {
    state.sentence = null;
    $("sentence-line").classList.add("hidden");
    beginWord(item.w, "Look at the word, then type it!");
  }
}

// ----- WORD MECHANIC (shared by both modes) -----
// display: what the kid sees (may carry capitals/punctuation, e.g. "bed.");
// the target he must type is always the cleaned, typeable form ("bed").
function beginWord(display, hint) {
  state.target = toTarget(display);
  $("prompt-hint").textContent = hint || "";
  const pw = $("prompt-word");
  pw.textContent = display;
  // long words shrink so they never clip at the screen edges
  const room = Math.min(window.innerWidth, 640) - 110; // 110 ≈ speaker + padding
  pw.style.fontSize = Math.max(30, Math.min(60,
    Math.floor(room / (0.62 * Math.max(display.length, 1))))) + "px";
  pw.classList.remove("gone");
  renderBoxes(state.target.length, "");
  const inp = $("typed");
  inp.value = "";
  inp.maxLength = state.target.length;
  inp.disabled = false;
  // focus to raise the keyboard (works inside the tap gesture chain)
  setTimeout(() => inp.focus(), 30);
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
  size = Math.max(22, Math.min(52, size));
  wrap.style.setProperty("--bs", size + "px");
  wrap.style.setProperty("--bg-gap", gap + "px");
  for (let i = 0; i < n; i++) {
    const b = document.createElement("div");
    b.className = "box" + (i < value.length ? " filled" : "");
    b.textContent = value[i] || "";
    wrap.appendChild(b);
  }
}

function onType() {
  if (state.answered) return;
  const inp = $("typed");
  const val = toTarget(inp.value);
  inp.value = val;
  // hide the prompt word the moment they start
  if (val.length >= 1) $("prompt-word").classList.add("gone");
  renderBoxes(state.target.length, val);
  $("check").disabled = val.length !== state.target.length;
}

function doCheck() {
  if (state.answered) return;
  const val = $("typed").value.toLowerCase();
  const correct = val === state.target;
  const boxes = $("boxes");
  $("typed").disabled = true;

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
    if (state.mode === "sentences") {
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
    $("feedback").textContent = "Almost! Look again 👀";
    $("feedback").className = "feedback bad";
    // re-queue this word once, later in the session, for extra practice
    if (!state.requeued && state.mode === "words") {
      state.requeued = true;
      const back = { w: state.target, group: "" };
      const pos = Math.min(state.queue.length, 2 + Math.floor(Math.random() * 3));
      state.queue.splice(pos, 0, back);
      state.total++;
    }
    setTimeout(() => {
      renderBoxes(state.target.length, state.target); // resets .boxes class...
      boxes.classList.add("reveal");                  // ...so add reveal after
      $("prompt-word").textContent = state.target;
      $("prompt-word").classList.remove("gone");
      $("prompt-hint").textContent = "This is how you spell it. Try again!";
      $("feedback").textContent = ""; // don't leave "Almost!" under the answer
      $("feedback").className = "feedback";
      $("check").classList.add("hidden");
      $("next").classList.remove("hidden");
      $("next").textContent = "Try again";
    }, 900);
  }
}

function advance() {
  // if this was a "try again" retry, re-present the same word
  if (state.missedThisItem && !state.answered) {
    resetItemUI();
    if (state.mode === "sentences") {
      const tok = state.sentence.tokens[state.sentence.wordIdx];
      beginWord(tok.display, "Try again — you can do it!");
      renderCurrentSentence();
    } else {
      beginWord(state.target, "Try again — you can do it!");
    }
    return;
  }
  loadNext();
}

// ----- SENTENCE MODE -----
function setupSentence(item) {
  $("sentence-line").classList.remove("hidden");
  advanceToTypableWord(item);
  renderCurrentSentence();
  const tok = item.tokens[item.wordIdx];
  beginWord(tok.display, "Spell this word to fill the sentence.");
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
  item.tokens.forEach((tok, i) => {
    const span = document.createElement("span");
    if (i < item.wordIdx) {
      span.className = "done-word";
      span.textContent = tok.display + " ";
    } else if (i === item.wordIdx) {
      span.className = "cur-word";
      span.textContent = "_".repeat(Math.max(tok.answer.length, 1));
      span.textContent += " ";
    } else {
      span.className = "todo-word";
      span.textContent = "_".repeat(Math.max(tok.answer.length, 1)) + " ";
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
  renderCurrentSentence();
  const tok = item.tokens[item.wordIdx];
  state.missedThisItem = false;
  resetItemUI();
  beginWord(tok.display, "Next word!");
}

// ----- results / finish -----
function updatePointsUI() {
  $("play-points").textContent = state.points;
  $("home-points").textContent = state.points;
  const pill = document.querySelector(".score-pill");
  if (pill) {
    pill.classList.remove("pop");
    void pill.offsetWidth; // restart the animation
    pill.classList.add("pop");
  }
}

function postAnswer(word, correct, aided) {
  postJSON("/api/answer", { word, correct, aided: !!aided })
    .then((r) => {
      // the server's count is the truth — adopt it so devices never drift
      if (typeof r.points === "number") {
        state.points = r.points;
        $("play-points").textContent = state.points;
        $("home-points").textContent = state.points;
      }
    })
    .catch(() => {});
}

function finishSession() {
  if (state.finished) return; // Next-tap and auto-advance can race here
  state.finished = true;
  $("check").classList.add("hidden");
  $("next").classList.add("hidden");
  postJSON("/api/session_end", {
    mode: state.mode,
    count: state.wordsDone,
    correct: state.correctCount,
    points: state.earned,
  }).catch(() => {});
  $("earned").textContent = state.earned;
  $("done-total").textContent = state.points;
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

function speakCurrent() {
  if (!("speechSynthesis" in window)) return;
  let text = state.target;
  if (state.mode === "sentences" && state.sentence) {
    const tok = state.sentence.tokens[state.sentence.wordIdx];
    if (!tok) return; // between the last word and the next sentence
    text = tok.answer;
  }
  if (!text) return;
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.8; u.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- DONE ----------
function wireDone() {
  $("again").addEventListener("click", () => {
    if (state.mode === "sentences") startSession();
    else { $("goal-row").classList.remove("hidden"); startSession(); }
  });
  $("home-btn").addEventListener("click", goHome);
}

function goHome() {
  $("home-points").textContent = state.points;
  $("goal-row").classList.add("hidden");
  window.speechSynthesis && window.speechSynthesis.cancel();
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
    const rep = await api("/api/parent/report", {
      headers: { "X-Parent-Pin": state.parentPin },
    });
    renderReport(rep);
  } catch (_) {
    alert("Could not load the report.");
    goHome();
  }
}

function renderReport(rep) {
  $("s-points").textContent = rep.summary.points;
  $("s-accuracy").textContent = rep.summary.accuracy + "%";
  $("s-words").textContent = rep.summary.words_practiced;
  $("s-sessions").textContent = rep.summary.sessions;

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

  renderCustom(rep.custom_words);

  $("set-name").value = rep.profile.name || "";
  $("set-level").value = String(rep.profile.max_level || 3);
  $("set-speaker").checked = rep.profile.show_speaker !== false;
  $("set-pin").value = "";
  $("settings-saved").textContent = "";
}

function renderCustom(words) {
  const wrap = $("custom-list");
  wrap.innerHTML = "";
  if (!words || !words.length) {
    wrap.innerHTML = '<span class="muted">No custom words yet.</span>';
    return;
  }
  words.forEach((w) => {
    const chip = document.createElement("span");
    chip.className = "word-chip";
    chip.innerHTML = `${esc(w)} <button aria-label="remove">✕</button>`;
    chip.querySelector("button").addEventListener("click", async () => {
      try {
        const r = await postJSON("/api/parent/custom_words",
          { pin: state.parentPin, action: "remove", word: w });
        renderCustom(r.custom_words);
        $("custom-status").textContent = "";
      } catch (_) {
        $("custom-status").textContent = "Could not remove — check your connection.";
      }
    });
    wrap.appendChild(chip);
  });
}

function wireParent() {
  $("custom-add").addEventListener("click", async () => {
    const val = $("custom-input").value.trim();
    if (!val) return;
    try {
      const r = await postJSON("/api/parent/custom_words",
        { pin: state.parentPin, action: "add", words: val });
      $("custom-input").value = "";
      renderCustom(r.custom_words);
      $("custom-status").textContent = "";
    } catch (_) {
      $("custom-status").textContent = "Could not add — check your connection.";
    }
  });

  $("save-settings").addEventListener("click", async () => {
    const body = {
      pin: state.parentPin,
      name: $("set-name").value,
      max_level: parseInt($("set-level").value, 10),
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
      state.showSpeaker = body.show_speaker;
      $("kid-name").textContent = body.name || "Caleb";
      $("settings-saved").textContent = "Saved ✓";
    } catch (_) {
      $("settings-saved").textContent = "Could not save.";
    }
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

boot();
