"use strict";

// ---------- tiny helpers ----------
const $ = (id) => document.getElementById(id);
const api = async (url, opts) => {
  const r = await fetch(url, opts);
  return r.ok ? r.json() : Promise.reject(await r.json().catch(() => ({})));
};
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
  index: 0,
  total: 0,
  correctCount: 0,
  earned: 0,
  // current item
  target: "",     // the string being spelled right now
  missedThisItem: false,
  requeued: false,
  answered: false,
  sentence: null, // {tokens, wordIdx} when in sentence mode
};

// ---------- boot ----------
async function boot() {
  try {
    const s = await api("/api/state");
    state.points = s.points || 0;
    state.showSpeaker = s.show_speaker !== false;
    $("kid-name").textContent = s.name || "Caleb";
    $("home-points").textContent = state.points;
  } catch (_) {}
  wireHome();
  wirePlay();
  wireDone();
  wireGate();
  wireParent();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
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
  state.index = 0;
  state.total = items.length;
  state.correctCount = 0;
  state.earned = 0;
  $("play-points").textContent = state.points;
  $("speaker").classList.toggle("hidden", !state.showSpeaker);
  show("play");
  loadNext();
}

function loadNext() {
  if (!state.queue.length) { finishSession(); return; }
  const item = state.queue.shift();
  state.answered = false;
  state.missedThisItem = false;
  state.requeued = false;
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("check").classList.remove("hidden");
  $("check").disabled = true;
  $("next").classList.add("hidden");

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
function beginWord(targetWord, hint) {
  state.target = targetWord.toLowerCase();
  $("prompt-hint").textContent = hint || "";
  const pw = $("prompt-word");
  pw.textContent = targetWord;
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
  const val = inp.value.replace(/[^a-zA-Z']/g, "").toLowerCase();
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
    postAnswer(state.target, true);
    state.correctCount++;
    state.points++;
    state.earned++;
    $("play-points").textContent = state.points;
    $("home-points").textContent = state.points;
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
      $("check").classList.add("hidden");
      $("next").classList.remove("hidden");
      $("next").textContent = "Try again";
    }, 900);
  }
}

function advance() {
  $("next").textContent = "Next →";
  // if this was a "try again" retry, re-present the same word
  if (state.missedThisItem && !state.answered) {
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
  state.answered = false;
  state.missedThisItem = false;
  $("check").classList.remove("hidden");
  $("next").classList.add("hidden");
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  beginWord(tok.display, "Next word!");
}

// ----- results / finish -----
function postAnswer(word, correct) {
  fetch("/api/answer", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ word, correct }),
  }).catch(() => {});
}

function finishSession() {
  fetch("/api/session_end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: state.mode,
      count: state.total,
      correct: state.correctCount,
      points: state.earned,
    }),
  }).catch(() => {});
  $("earned").textContent = state.earned;
  $("done-total").textContent = state.points;
  show("done");
}

// ---------- PLAY wiring ----------
function wirePlay() {
  $("typed").addEventListener("input", onType);
  $("typed").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("check").disabled && !$("check").classList.contains("hidden")) {
      e.preventDefault();
      doCheck();
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
  const text = state.mode === "sentences" && state.sentence
    ? state.sentence.tokens[state.sentence.wordIdx].answer
    : state.target;
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
function renderPinDots() {
  document.querySelectorAll("#pin-dots i").forEach((d, i) => {
    d.classList.toggle("on", i < pinEntry.length);
  });
}
function wireGate() {
  document.querySelectorAll(".pin-key").forEach((k) => {
    k.addEventListener("click", async () => {
      if (k.classList.contains("del")) {
        pinEntry = pinEntry.slice(0, -1);
      } else if (pinEntry.length < 8) {
        pinEntry += k.textContent;
      }
      renderPinDots();
      if (pinEntry.length >= 4) {
        try {
          const r = await api("/api/parent/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin: pinEntry }),
          });
          if (r.ok) { state.parentPin = pinEntry; openParent(); }
          else if (pinEntry.length >= 4) { flashPinError(); }
        } catch (_) { flashPinError(); }
      }
    });
  });
  document.querySelectorAll("[data-home]").forEach((b) =>
    b.addEventListener("click", goHome));
}
function flashPinError() {
  // only complain once the entry is plausibly complete (4 digits) and wrong
  if (pinEntry.length >= 4) {
    $("pin-err").textContent = "Wrong PIN — try again.";
    pinEntry = "";
    renderPinDots();
  }
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
      const r = await api("/api/parent/custom_words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: state.parentPin, action: "remove", word: w }),
      });
      renderCustom(r.custom_words);
    });
    wrap.appendChild(chip);
  });
}

function wireParent() {
  $("custom-add").addEventListener("click", async () => {
    const val = $("custom-input").value.trim();
    if (!val) return;
    const r = await api("/api/parent/custom_words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: state.parentPin, action: "add", words: val }),
    });
    $("custom-input").value = "";
    renderCustom(r.custom_words);
  });

  $("save-settings").addEventListener("click", async () => {
    const body = {
      pin: state.parentPin,
      name: $("set-name").value,
      max_level: parseInt($("set-level").value, 10),
      show_speaker: $("set-speaker").checked,
    };
    const newPin = $("set-pin").value.trim();
    if (newPin) body.new_pin = newPin;
    try {
      await api("/api/parent/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (newPin) state.parentPin = newPin;
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
