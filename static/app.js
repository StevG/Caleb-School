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
const MODE_LABELS = { copy: "Copy It", words: "Hide & Spell",
                      listen: "Listen & Spell",
                      sentences: "Fill In", memory: "Remember It",
                      pick: "Which One?", build: "Build It" };
function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  $(screenId).classList.add("active");
}

// ---------- app state ----------
const state = {
  mode: "words",
  goal: 10,
  showSpeaker: true,
  autoplayAudio: false, // per-child: auto-speak "word, then spell it" on show
  wordRate: 0.8,        // per-child TTS speeds (parent-tunable)
  spellRate: 0.45,
  parentPin: "",
  // multiple kids: this DEVICE remembers who practices on it. Only a parent
  // can change the pick (dashboard Settings) — the kid's home screen has no
  // switcher, so one kid can't do another kid's practice. The dashboard has
  // its own independent selection (parentChild).
  childId: "",
  children: [],      // roster from the server: [{id, name, points}]
  parentChild: "",   // the child the dashboard is showing/editing
  assignment: null,  // mission id when the current session IS a mission
  quest: false,      // true when the current session is Today's Quest
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
  peeked: false,     // used "Show me again": earns the star, no ladder credit
  answered: false,
  sentence: null,    // {s, tokens, wordIdx} in sentence/memory modes
  curHidden: false,  // sentence line: is the current word masked yet?
  memorizing: false, // memory mode: still in the read-the-sentence phase
  caseSensitive: false, // sentence modes require the capitals too
  itemStage: 2,      // ladder stage of the current word (words mode)
  itemHeart: null,   // irregular grapheme(s) of the current heart word
  keepVisible: false, // stage 1 "copy it": word stays visible while typing
  levelUps: 0,       // stage-ups this session (celebrated on the done screen)
  sessionStreak: 0,  // consecutive unaided corrects this session (🔥 toasts)
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
      state.showSpeaker = s.show_speaker !== false;
      state.autoplayAudio = s.autoplay_audio === true;
      if (s.word_rate) state.wordRate = s.word_rate;
      if (s.spell_rate) state.spellRate = s.spell_rate;
      $("kid-name").textContent = s.name || "Caleb";
      $("badges-count").textContent = s.badges_earned || 0;
      renderMissions(s.missions || []);
      renderGreeting(s);
      renderDailyFact(s.daily_fact);
      renderQuestCard(s);
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
      state.quest = false;
      startSession();
    });
    list.appendChild(b);
  });
}

// ---------- home greeting (walk in on evidence of competence) ----------
function renderGreeting(s) {
  const wrap = $("greeting-chips");
  const chips = [];
  // a streak of 2+ days is a real thing to celebrate ("Day 1" is just noise)
  if ((s.streak_days || 0) >= 2) {
    chips.push(`<span class="g-chip streak">🦕 Day ${s.streak_days}!</span>`);
  }
  // yesterday's win — only until he's practiced today (then it's stale)
  if (s.yesterday && !s.practiced_today && (s.yesterday.correct || 0) > 0) {
    chips.push(`<span class="g-chip">Yesterday: ${s.yesterday.correct} right ✅</span>`);
  }
  wrap.innerHTML = chips.join("");
  wrap.classList.toggle("hidden", !chips.length);
}

// ---------- fact of the day (pure fun, no strings, changes daily) ----------
function renderDailyFact(f) {
  const card = $("daily-fact");
  if (!f || !f.text) { card.classList.add("hidden"); return; }
  $("df-emoji").textContent = f.emoji || "🦕";
  $("df-text").textContent = f.text;
  card.classList.remove("hidden");
}

// ---------- Today's Quest (one-tap 5-word warm-up) ----------
function renderQuestCard(s) {
  const done = !!s.quest_done_today;
  $("quest-title").textContent = done ? "Quest done! ✅" : "Today's Quest";
  $("quest-sub").textContent = done ? "Play again?" : "5 words — let's go!";
  $("quest-card").classList.toggle("quest-done", done);
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

// ---------- badges ----------
// One SVG draws every badge: a flat-top hexagon (white face, ink outline,
// accent ring, big emoji), with a beveled plate added to a diagonal edge per
// earned level — clockwise from upper-right: bronze, silver, gold, rainbow.
const BADGE_TIER_FILL = ["#cd8a4b", "#b9c2cc", "#f4b942", "url(#badge-rainbow)"];
const BADGE_TIER_EDGE = ["#a96a33", "#93a1ad", "#d99a1e", "#7a5fb5"];

function badgeSVG(emoji, tier, accent, dim) {
  const cx = 60, cy = 60, R = 42;
  const v = [];
  for (let i = 0; i < 6; i++) {
    const th = i * Math.PI / 3;
    v.push([cx + R * Math.cos(th), cy + R * Math.sin(th)]);
  }
  const scale = (p, k) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // clockwise diagonal edges from upper-right; top & bottom stay clean
  const order = [[v[5], v[0]], [v[0], v[1]], [v[3], v[2]], [v[4], v[3]]];
  let plates = "";
  for (let i = 0; i < Math.min(tier, 4); i++) {
    const [a, b] = order[i];
    const ai = lerp(a, b, 0.08), bi = lerp(b, a, 0.08);
    const ao = scale(ai, 1.2), bo = scale(bi, 1.2);
    plates += `<polygon points="${ai},${bi},${bo},${ao}" fill="${BADGE_TIER_FILL[i]}"` +
      ` stroke="${BADGE_TIER_EDGE[i]}" stroke-width="1.5" stroke-linejoin="round"/>`;
  }
  const hex = v.map((p) => p.join(",")).join(" ");
  const inner = v.map((p) => scale(p, 0.82).join(",")).join(" ");
  const face = dim ? "#f1eadd" : "#fff";
  const ring = dim ? "#d9cfc0" : accent;
  const dash = dim ? ' stroke-dasharray="5 5"' : "";
  return `<svg viewBox="0 0 120 120" class="badge-svg">` +
    `<defs><linearGradient id="badge-rainbow" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#4f9dde"/><stop offset=".5" stop-color="#5bbf6a"/>` +
    `<stop offset="1" stop-color="#f4b942"/></linearGradient></defs>${plates}` +
    `<polygon points="${hex}" fill="${face}" stroke="#2d2a26" stroke-width="2.5"` +
    ` stroke-linejoin="round"${dash}/>` +
    `<polygon points="${inner}" fill="none" stroke="${ring}" stroke-width="2"` +
    ` stroke-linejoin="round" opacity="${dim ? .5 : .85}"/>` +
    `<text x="60" y="62" font-size="38" text-anchor="middle"` +
    ` dominant-baseline="central" opacity="${dim ? .4 : 1}">${emoji}</text></svg>`;
}

const BADGE_LEVELS = ["Locked", "Level 1", "Level 2", "Level 3", "Level 4 ★"];

// progress toward the NEXT level (0..1); speed badges count down, so invert
function badgeProgress(b) {
  if (b.level >= 4 || b.next_at == null) return 1;
  const prev = b.prev_at || 0;
  if (b.lower_better) {
    if (!b.value) return 0;
    // from prev threshold (or a soft ceiling) down to next
    const ceil = prev || b.next_at * 2;
    return Math.max(0, Math.min(1, (ceil - b.value) / (ceil - b.next_at)));
  }
  return Math.max(0, Math.min(1, (b.value - prev) / (b.next_at - prev)));
}

function openBadges() {
  show("badges-screen");
  api("/api/badges?child=" + encodeURIComponent(state.childId))
    .then((d) => renderBadgeCase(d)).catch(() => {});
}

function renderBadgeCase(d) {
  $("badges-earned").textContent = d.earned;
  $("badges-all").textContent = d.total;
  const grid = $("badge-grid");
  grid.innerHTML = "";
  // group by category, keeping catalog order
  const cats = [];
  d.badges.forEach((b) => {
    let g = cats.find((c) => c.name === b.category);
    if (!g) { g = { name: b.category, items: [] }; cats.push(g); }
    g.items.push(b);
  });
  cats.forEach((g) => {
    const h = document.createElement("div");
    h.className = "badge-cat";
    h.textContent = g.name;
    grid.appendChild(h);
    const row = document.createElement("div");
    row.className = "badge-row";
    g.items.forEach((b) => {
      const cell = document.createElement("button");
      cell.className = "badge-cell" + (b.level ? "" : " locked");
      cell.innerHTML = badgeSVG(b.emoji, b.level, b.accent, b.level === 0) +
        `<span class="badge-cell-name">${esc(b.name)}</span>` +
        `<span class="badge-cell-lvl">${b.level ? BADGE_LEVELS[b.level] : "Locked"}</span>`;
      cell.addEventListener("click", () => openBadgeDetail(b));
      row.appendChild(cell);
    });
    grid.appendChild(row);
  });
}

function openBadgeDetail(b) {
  $("bd-badge").innerHTML = badgeSVG(b.emoji, b.level, b.accent, b.level === 0);
  $("bd-name").textContent = b.name;
  $("bd-level").textContent = b.level ? BADGE_LEVELS[b.level] : "Not earned yet";
  $("bd-blurb").textContent = b.blurb;
  const next = $("bd-next");
  if (b.level >= 4) {
    next.innerHTML = `<div class="bd-max">🌈 Maxed out — every level earned!</div>`;
  } else {
    const goal = b.lower_better
      ? `${b.next_at}${b.unit ? " " + b.unit : ""} or faster`
      : `${b.next_at} ${b.unit || ""}`.trim();
    const have = b.lower_better
      ? (b.value ? `${b.value} ${b.unit || ""}`.trim() : "not started")
      : `${b.value}`;
    next.innerHTML =
      `<div class="bd-next-label">Next: Level ${b.level + 1} — ${esc(goal)}</div>` +
      `<div class="bd-bar"><span style="width:${Math.round(badgeProgress(b) * 100)}%"></span></div>` +
      (b.level === 0 ? `<div class="bd-unlock">Unlock: ${esc(b.unlock)}</div>`
        : `<div class="bd-have">You're at ${esc(have)}</div>`);
  }
  $("badge-detail").classList.remove("hidden");
}

// the done-screen celebration for freshly-earned levels (the badge IS the
// reward — no star payout rides along)
function celebrateBadges(list) {
  const wrap = $("badge-earns");
  wrap.innerHTML = list.map((nb) =>
    `<div class="badge-earn">${badgeSVG(nb.emoji, nb.level, "#f4b942", false)}` +
    `<div class="be-text">${esc(nb.name)}<small>Level ${nb.level}</small></div></div>`
  ).join("");
}

// the compact parent strip (rep.badges — same shape as /api/badges)
function renderParentBadges(badges) {
  const strip = $("p-badge-strip");
  const earned = (badges || []).filter((b) => b.level > 0);
  $("p-badge-count").textContent = `${earned.length}/${(badges || []).length}`;
  strip.innerHTML = "";
  if (!badges || !badges.length) return;
  // earned first (by level desc), then the closest not-yet-earned
  const sorted = [...badges].sort((a, b) =>
    (b.level - a.level) || (badgeProgress(b) - badgeProgress(a)));
  sorted.slice(0, 8).forEach((b) => {
    const cell = document.createElement("div");
    cell.className = "p-badge";
    cell.innerHTML = badgeSVG(b.emoji, b.level, b.accent, b.level === 0) +
      `<span>${b.level ? "L" + b.level : "—"}</span>`;
    cell.title = `${b.name}: ${b.level ? BADGE_LEVELS[b.level] : "not earned"}`;
    strip.appendChild(cell);
  });
}

function wireBadges() {
  $("badges-btn").addEventListener("click", openBadges);
  $("badges-back").addEventListener("click", () => { resetHomeMenu(); show("home"); });
  $("bd-close").addEventListener("click", () => $("badge-detail").classList.add("hidden"));
  $("badge-detail").addEventListener("click", (e) => {
    if (e.target === $("badge-detail")) $("badge-detail").classList.add("hidden");
  });
}

// done-screen: the "what's next" badge nudge (skipped when a badge was earned)
function showNextBadge(nb) {
  const el = $("next-badge");
  if (!nb) { el.textContent = ""; return; }
  const togo = Math.max(1, nb.need - nb.have);
  el.textContent = `🎖️ ${nb.name} Lv ${nb.level + 1} — ${togo} to go!`;
}

function boot() {
  // Wire everything first — buttons must work even if the network is slow.
  wireHome();
  wirePlay();
  wireDone();
  wireGate();
  wireParent();
  wireBadges();
  wireFeedback();
  initUpdates();
  state.childId = storedChild();
  refreshState().catch(() => {});
}

// ---------- parent feedback (→ server logs) ----------
// A multiline note + up to 3 screenshots. Screenshots are downscaled in the
// browser (no libraries — a canvas) so the upload stays small, then POSTed to
// /api/parent/feedback where the server logs them for review.
let fbShots = []; // [{name, dataURL}]

function downscaleImage(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderFbThumbs() {
  const wrap = $("fb-thumbs");
  wrap.innerHTML = "";
  fbShots.forEach((s, i) => {
    const t = document.createElement("div");
    t.className = "fb-thumb";
    t.innerHTML = `<img src="${s.dataURL}" alt="screenshot">` +
      `<button class="fb-rm" aria-label="remove">✕</button>`;
    t.querySelector(".fb-rm").addEventListener("click", () => {
      fbShots.splice(i, 1); renderFbThumbs();
    });
    wrap.appendChild(t);
  });
  $("fb-shot-note").textContent = fbShots.length
    ? `${fbShots.length}/3 attached` : "";
}

function wireFeedback() {
  $("fb-file").addEventListener("change", async (e) => {
    const files = [...(e.target.files || [])];
    for (const f of files) {
      if (fbShots.length >= 3) break;
      try {
        const dataURL = await downscaleImage(f, 1200, 0.6);
        fbShots.push({ name: f.name, dataURL });
      } catch (_) { /* skip a file we can't read */ }
    }
    e.target.value = ""; // let the same file be re-picked later
    renderFbThumbs();
  });

  $("fb-send").addEventListener("click", async () => {
    const text = $("fb-text").value.trim();
    if (!text && !fbShots.length) {
      $("fb-saved").textContent = "Write something (or add a screenshot) first.";
      return;
    }
    $("fb-send").disabled = true;
    $("fb-saved").textContent = "Sending…";
    try {
      const r = await postJSON("/api/parent/feedback", {
        pin: state.parentPin,
        child: state.parentChild,
        text,
        screenshots: fbShots.map((s) => s.dataURL),
        device: navigator.userAgent.slice(0, 120),
      });
      if (r && r.ok) {
        $("fb-text").value = "";
        fbShots = []; renderFbThumbs();
        $("fb-saved").textContent = "Thanks! Sent to the server logs ✅";
      } else {
        $("fb-saved").textContent = "Could not send — try again.";
      }
    } catch (_) {
      $("fb-saved").textContent = "Could not send — check your connection.";
    } finally {
      $("fb-send").disabled = false;
    }
  });
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

  // re-check whenever the app comes back to the foreground, plus a fast tick
  // so a fresh deploy shows the "Update" bar within ~15s of the server restart
  const recheck = () => {
    if (document.hidden) return;
    if (swReg) swReg.update().catch(() => {});
    api("/api/version").then((v) => {
      if (bootVersion && v.version && v.version !== bootVersion) showUpdateBar();
    }).catch(() => {});
  };
  document.addEventListener("visibilitychange", recheck);
  window.addEventListener("focus", recheck);
  setInterval(recheck, 15000);
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
// The home is a three-step drill-down so only a few big targets show at once
// (no scrolling): pick a SECTION (Words / Sentences) -> pick a GAME in it ->
// (word games) pick how many. Back steps up one level; each step slides in.
function showPanel(name) {
  document.querySelectorAll(".home-panel").forEach((p) => {
    const on = p.dataset.panel === name;
    p.classList.toggle("hidden", !on);
    if (on) { p.classList.remove("slide-in"); void p.offsetWidth; p.classList.add("slide-in"); }
  });
  // The landing extras (Quest card, greeting, chips, missions) belong to the
  // top level only. Tuck them away while drilling into a game/count so the
  // panel keeps the whole screen — no scrolling on short (landscape) phones.
  const landing = name === "sections";
  document.querySelectorAll("[data-landing]").forEach((el) =>
    el.classList.toggle("drilled-hide", !landing));
}

function wireHome() {
  // STEP 1: a section reveals only its own games
  document.querySelectorAll(".section-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sec = btn.dataset.section;
      document.querySelectorAll(".game-set").forEach((g) =>
        g.classList.toggle("hidden", g.dataset.set !== sec));
      showPanel("games");
    });
  });
  // STEP 2: a game either asks how many (word games) or starts (sentences)
  document.querySelectorAll(".mode-card").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.mode = btn.dataset.mode;
      state.assignment = null; // free play, not a mission
      state.quest = false;
      if (["copy", "words", "listen", "pick", "build"].includes(state.mode))
        showPanel("goal");
      else startSession();
    });
  });
  // STEP 3: pick a count -> go
  document.querySelectorAll(".chip").forEach((c) => {
    c.addEventListener("click", () => {
      state.goal = parseInt(c.dataset.goal, 10);
      startSession();
    });
  });
  // every "⬅ Back" steps up to the panel named on it
  document.querySelectorAll(".back-link").forEach((b) =>
    b.addEventListener("click", () => showPanel(b.dataset.back)));
  // Today's Quest: one tap, straight into a 5-word warm-up
  $("quest-card").addEventListener("click", () => {
    state.mode = "words";
    state.assignment = null;
    state.quest = true;
    startSession();
  });
  // fact of the day: 🔊 reads it aloud (reading it himself stays optional)
  $("df-say").addEventListener("click", () =>
    speakText($("df-text").textContent));
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

// Back to step 1 (the section picker) — used when leaving a session.
function resetHomeMenu() {
  showPanel("sections");
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
    const url = state.quest
      ? `/api/session?quest=1&child=${encodeURIComponent(state.childId)}`
      : `/api/session?mode=${state.mode}&count=${count}` +
        `&child=${encodeURIComponent(state.childId)}` +
        (state.assignment ? `&assignment=${encodeURIComponent(state.assignment)}` : "");
    const data = await api(url);
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
  state.sessionStreak = 0;
  state.finished = false;
  state.sessionStart = Date.now(); // for the Speed of Light badge (secs/word)
  state.sessionWords = []; // per-word first-try results for the parent view
  $("play-points").textContent = "+0";
  // memory (dictation), listen (audio-only) and Which One? (recognition by
  // sound) NEED the speaker; so does auto-play. Otherwise it follows the
  // parent's "show speaker" setting.
  $("speaker").classList.toggle("hidden",
    !state.showSpeaker && !state.autoplayAudio &&
    !["memory", "listen", "pick"].includes(state.mode));
  show("play");
  loadNext();
}

// Reset per-word UI: Check visible but disabled, Next hidden, feedback clear.
// Every path that presents a word to spell (new item, next sentence word,
// retry after a miss) MUST go through this so no path forgets a piece.
function resetItemUI() {
  state.answered = false;
  state.locked = false;
  state.typedStarted = false; // fresh word: 🔊 spells it until he starts typing
  state.peeked = false;
  $("feedback").textContent = "";
  $("feedback").className = "feedback";
  $("check").classList.remove("hidden");
  $("check").disabled = true;
  $("next").classList.add("hidden");
  $("next").textContent = "Next →";
  // the new games' widgets are hidden by default; their begin* funcs show them
  $("choices").classList.add("hidden");
  $("tiles-wrap").classList.add("hidden");
  $("typed").removeAttribute("readonly"); // Build It re-adds it; others type
  // "Show me again" is a grace path for the hide-on-type games (Copy It shows
  // the word anyway; sentence modes lean on the sentence line; Which One? is
  // recognition — the choices already show the answer)
  const canPeek = ["words", "listen", "build"].includes(state.mode);
  $("peek-btn").classList.toggle("hidden", !canPeek);
}

// Peek: re-show the word (or, in Listen & Spell, show it for the first time).
// It hides again on the next keystroke via the normal hide-on-type path.
// The deal is honest: a peek keeps the star but not the ladder climb — it's
// aided, exactly like a retype after the reveal. Crucially it is NOT a miss:
// no shake, no rung drop, no requeue. Blanking on a word shouldn't punish him.
function doPeek() {
  if (state.answered || state.locked) return;
  state.peeked = true;
  const pw = $("prompt-word");
  pw.innerHTML = heartSpans(state.target, state.itemHeart);
  sizePrompt();
  pw.classList.remove("gone");
  $("prompt-hint").textContent = "Peek! It still counts for a star ⭐";
}

function loadNext() {
  if (!state.queue.length) { finishSession(); return; }
  const item = state.queue.shift();
  state.missedThisItem = false;
  state.requeued = false;
  resetItemUI();

  const doneCount = state.total - state.queue.length - 1;
  const pct = Math.round((doneCount / Math.max(state.total, 1)) * 100);
  $("progress-fill").style.width = pct + "%";
  // the dino-rocket hops along the track each word — position, never a timer;
  // it makes "10 words" feel finite and short
  const rocket = $("progress-rocket");
  if (rocket) {
    rocket.style.left = pct + "%";
    rocket.classList.remove("hop"); void rocket.offsetWidth;
    rocket.classList.add("hop");
  }

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
  } else if (state.mode === "pick") {
    state.sentence = null;
    $("sentence-line").classList.add("hidden");
    beginPickItem(item);
  } else if (state.mode === "build") {
    state.sentence = null;
    $("sentence-line").classList.add("hidden");
    beginBuildItem(item);
  } else {
    state.sentence = null;
    $("sentence-line").classList.add("hidden");
    presentWordItem(item);
  }
}

// Presentation follows the GAME, not the word's ladder rung. This is the
// whole point of the game split — and it must hold for REQUEUED words too:
// a missed Hide & Spell word gets re-queued a rung down (stage 1), and if
// presentation keyed off that stage the word would come back *visible*
// mid-round (the "I could see it while typing" bug). Keying off state.mode
// instead makes every Hide & Spell word hide on the first keystroke, always.
//   Copy It (mode "copy")   — the word stays visible the whole time he types
//   Hide & Spell (mode ...) — hides at the first keystroke
// (Listen & Spell is audio-only and handled separately in loadNext.)
function presentWordItem(item) {
  const heartHint = "Heart word! The red part is the tricky bit ♥";
  if (state.mode === "copy") {
    state.itemStage = 1;
    beginWord(item.w,
      item.heart ? heartHint : "Copy it — it stays right here 👀",
      false, true, item.heart);   // keepVisible: never hides
  } else {
    state.itemStage = 2;
    beginWord(item.w,
      item.heart ? heartHint : "Look at the word — it hides when you type!",
      false, false, item.heart);  // hides on the first keystroke
  }
  maybeAutoplayWord(); // say + spell it, if the parent enabled auto-play
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

// ----- WHICH ONE? (pick): recognition — hear it, tap the right spelling -----
// The word is spoken and never shown except as the three choices. A tap ends
// the item (no typing, no retype). Recognition is weaker than recall, so pick
// answers never move the ladder (server-side, NO_LADDER_MODES).
function beginPickItem(item) {
  state.target = toTarget(item.w);
  state.itemHeart = item.heart || null;
  state.lastChoices = item.choices || [item.w];
  state.caseSensitive = false;
  $("prompt-word").textContent = "";
  $("prompt-word").classList.remove("gone");
  $("prompt-hint").textContent = "Listen 🔊 — which spelling is right?";
  $("boxes").innerHTML = "";
  $("typed").value = "";
  $("typed").blur();               // no keyboard in this game
  $("check").classList.add("hidden");
  $("peek-btn").classList.add("hidden");
  const wrap = $("choices");
  wrap.classList.remove("hidden");
  wrap.innerHTML = "";
  (item.choices || []).forEach((c) => {
    const b = document.createElement("button");
    b.className = "choice";
    b.textContent = c;
    b.addEventListener("click", () => checkPick(c, b));
    b.addEventListener("mousedown", (e) => e.preventDefault());
    wrap.appendChild(b);
  });
  speakText(state.target); // say the word; 🔊 repeats it
}

function checkPick(choice, btn) {
  if (state.answered) return;
  const correct = choice === state.target;
  state.answered = true;
  const wrap = $("choices");
  wrap.querySelectorAll(".choice").forEach((b) => { b.disabled = true; });
  if (correct) {
    btn.classList.add("right");
    $("feedback").textContent = pick(["Yes! 🌟", "You got it! ✅", "Nice! 👏"]);
    $("feedback").className = "feedback good";
    (state.sessionWords || (state.sessionWords = [])).push({ w: state.target, ok: true });
    postAnswer(state.target, true, false);
    state.correctCount++;
    state.sessionStreak++;
    if ([3, 5, 10].includes(state.sessionStreak)) {
      $("feedback").textContent += ` 🔥 ${state.sessionStreak} in a row!`;
    }
    state.wordsDone++;
    state.earned++;
    updatePointsUI();
    setTimeout(loadNext, 800);
  } else {
    if (btn) btn.classList.add("wrong-choice");
    // highlight the RIGHT one so the study value lands
    wrap.querySelectorAll(".choice").forEach((b) => {
      if (b.textContent === state.target) b.classList.add("right");
    });
    $("feedback").textContent = "That one's tricky! This is the real one 👉";
    $("feedback").className = "feedback bad";
    (state.sessionWords || (state.sessionWords = [])).push({ w: state.target, ok: false });
    postAnswer(state.target, false, false);
    state.sessionStreak = 0;
    state.wordsDone++;
    // missed words come back once, later in the session
    if (!state.requeued) {
      state.requeued = true;
      const back = { w: state.target, group: "",
                     heart: state.itemHeart || undefined,
                     choices: shuffle((state.lastChoices || [state.target]).slice()) };
      const pos = Math.min(state.queue.length, 2 + Math.floor(Math.random() * 3));
      state.queue.splice(pos, 0, back);
      state.total++;
    }
    setTimeout(loadNext, 1500);
  }
}

// ----- BUILD IT (build): tap scrambled LEGO tiles to spell the word --------
// Look–cover–build–check: the word shows, then hides on the first tile tap.
// Tiles write into the hidden #typed input and call onType(), so check /
// reveal / aided-retype / requeue all come free. No keyboard (readonly).
function beginBuildItem(item, retry) {
  state.buildItem = item;
  state.caseSensitive = false;
  state.keepVisible = false;
  state.itemHeart = item.heart || null;
  state.target = toTarget(item.w);
  const pw = $("prompt-word");
  pw.innerHTML = heartSpans(item.w, item.heart);
  sizePrompt();
  pw.classList.remove("gone");
  $("prompt-hint").textContent = item.heart
    ? "Heart word! Tap the blocks to build it 🧱"
    : "Build the word — tap the blocks!";
  const inp = $("typed");
  inp.value = "";
  inp.setAttribute("readonly", "readonly"); // no on-screen keyboard
  inp.blur();
  renderBoxes(state.target.length, "");
  // scramble the target's letters into tiles (never the correct order)
  let letters = state.target.split("");
  do { shuffle(letters); }
  while (letters.join("") === state.target && state.target.length > 1);
  state.buildTiles = letters.map((ch) => ({ ch, used: false }));
  renderTiles();
  $("tiles-wrap").classList.remove("hidden");
  if (!retry) maybeAutoplayWord();
}

function renderTiles() {
  const wrap = $("tiles");
  wrap.innerHTML = "";
  state.buildTiles.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "tile" + (t.used ? " used" : "");
    b.innerHTML = `<span class="stud"></span>${esc(t.ch)}`;
    b.disabled = t.used;
    b.addEventListener("click", () => tapTile(i));
    b.addEventListener("mousedown", (e) => e.preventDefault());
    wrap.appendChild(b);
  });
}

function tapTile(i) {
  if (state.answered || state.locked) return;
  const t = state.buildTiles[i];
  if (t.used) return;
  const inp = $("typed");
  if (inp.value.length >= state.target.length) return;
  t.used = true;
  inp.value += t.ch;
  renderTiles();
  onType(); // hides the word on the first tile, fills boxes, enables Check
}

function undoTile() {
  if (state.answered || state.locked) return;
  const inp = $("typed");
  if (!inp.value.length) return;
  const last = inp.value[inp.value.length - 1];
  inp.value = inp.value.slice(0, -1);
  // free the most-recently-used matching tile
  for (let i = state.buildTiles.length - 1; i >= 0; i--) {
    if (state.buildTiles[i].used && state.buildTiles[i].ch === last) {
      state.buildTiles[i].used = false; break;
    }
  }
  renderTiles();
  onType();
}

function renderBoxes(n, value, reserve) {
  const wrap = $("boxes");
  wrap.className = "boxes";
  wrap.innerHTML = "";
  // The whole word must fit on ONE line — its shape is a memory cue.
  // Shrink boxes (and gaps) for long words instead of wrapping. `reserve` is
  // extra horizontal space to leave for the Map-it chunk gaps on the reveal.
  reserve = reserve || 0;
  const avail = (wrap.clientWidth || wrap.parentElement.clientWidth || 340)
    - reserve;
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

// ----- Map it: grapheme chunking on the reveal (Elkonin boxes) -----
// A JS mirror of wordbank.grapheme_split — segment the word into the
// sound-spellings a Within-Word-Pattern speller learns (b|oa|t, n|igh|t),
// so the aided retype becomes phoneme-grapheme mapping, not letter-copying.
// GUARANTEE: chunks rejoin to the word, else per-letter fallback.
const GRAPHEMES = ["eigh", "tch", "dge", "igh", "air", "ear", "are", "ore",
  "sh", "ch", "th", "wh", "ph", "ck", "ng", "kn", "wr", "qu",
  "ai", "ay", "ee", "ea", "oa", "ow", "oo", "ue", "ew", "ie",
  "oi", "oy", "ou", "au", "aw", "ar", "or", "er", "ir", "ur", "oe"]
  .sort((a, b) => b.length - a.length);
const VOWELS_SET = new Set(["a", "e", "i", "o", "u"]);

function graphemeSplit(word) {
  const w = word.toLowerCase();
  const chunks = [];
  let i = 0;
  while (i < word.length) {
    if (i + 1 < word.length && w[i] === w[i + 1] && !VOWELS_SET.has(w[i]) &&
        /[a-z]/.test(w[i])) {
      chunks.push(word.slice(i, i + 2)); i += 2; continue;
    }
    let matched = null;
    for (const g of GRAPHEMES) {
      if (w.startsWith(g, i)) { matched = g; break; }
    }
    if (matched) { chunks.push(word.slice(i, i + matched.length)); i += matched.length; }
    else { chunks.push(word.slice(i, i + 1)); i += 1; }
  }
  return chunks.join("") === word ? chunks : word.split("");
}

// which letter indices are part of a heart grapheme (rendered red) — mirrors
// heartSpans's left-to-right matching of "ai" / "o-e" style hints
function heartIndices(target, heart) {
  const set = new Set();
  if (!heart) return set;
  const lower = target.toLowerCase();
  let from = 0;
  for (const part of heart.toLowerCase().split("-")) {
    if (!part) continue;
    const idx = lower.indexOf(part, from);
    if (idx === -1) return new Set(); // mapping doesn't fit — no red
    for (let k = 0; k < part.length; k++) set.add(idx + k);
    from = idx + part.length;
  }
  return set;
}

// The reveal: fill the boxes with the answer, grouped into grapheme chunks
// (extra gap + alternating tint between chunks; heart letters stay red).
function renderRevealBoxes(target, heart) {
  const chunks = graphemeSplit(target);
  const CHUNK_GAP = 12;
  renderBoxes(target.length, target, (chunks.length - 1) * CHUNK_GAP);
  const wrap = $("boxes");
  wrap.style.setProperty("--chunk-gap", CHUNK_GAP + "px");
  const heartIdx = heartIndices(target, heart);
  const boxes = wrap.children;
  let pos = 0;
  chunks.forEach((ch, ci) => {
    for (let k = 0; k < ch.length; k++) {
      const box = boxes[pos];
      if (box) {
        if (ci > 0 && k === 0) box.classList.add("chunk-start");
        if (ci % 2) box.classList.add("chunk-alt");
        if (heartIdx.has(pos)) box.classList.add("heart-box");
      }
      pos++;
    }
  });
}

function onType() {
  if (state.answered || state.locked) return;
  const inp = $("typed");
  let val = cleanChars(inp.value);
  if (!state.caseSensitive) val = val.toLowerCase();
  inp.value = val;
  // the moment he types, kill any audio so the spoken spelling can't be copied,
  // and remember he's started so 🔊 only says the word (no more spelling) now
  if (val.length >= 1) { stopSpeech(); state.typedStarted = true; }
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

// How close was a wrong attempt? Every wrong try is the same length as the
// target (the input is length-capped), so a positional diff tells us whether
// he was one letter off, swapped two, or mostly right — each gets its own
// encouraging line instead of a flat "wrong".
function closenessMessage(val) {
  const t = state.target;
  if (state.caseSensitive && val.toLowerCase() === t.toLowerCase()) {
    return "So close! Check the capital letter 🔠";
  }
  const cmp = state.caseSensitive ? val : val.toLowerCase();
  const tgt = state.caseSensitive ? t : t.toLowerCase();
  if (cmp.length !== tgt.length) return "Almost! Look again 👀";
  const diff = [];
  for (let i = 0; i < tgt.length; i++) if (cmp[i] !== tgt[i]) diff.push(i);
  const n = diff.length;
  if (n === 2) {
    const [a, b] = diff;
    if (b === a + 1 && cmp[a] === tgt[b] && cmp[b] === tgt[a]) {
      return "Ooh! Two letters swapped places 🔀";
    }
  }
  if (n === 1) return "SO close! Just ONE letter is different 🔍";
  if (n && n <= tgt.length / 2) {
    return `You got ${tgt.length - n} letters right! 💪`;
  }
  return "Almost! Look again 👀";
}

// Outline the letter boxes that are wrong so his eye lands on what to fix.
function markOffBoxes(val) {
  const cmp = state.caseSensitive ? val : val.toLowerCase();
  const tgt = state.caseSensitive ? state.target : state.target.toLowerCase();
  if (cmp.length !== tgt.length) return;
  const boxes = $("boxes").children;
  for (let i = 0; i < boxes.length && i < tgt.length; i++) {
    if (cmp[i] !== tgt[i]) boxes[i].classList.add("box-off");
  }
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

  $("peek-btn").classList.add("hidden");
  if (correct) {
    state.answered = true;
    boxes.classList.add("correct");
    $("prompt-word").classList.remove("gone");
    $("feedback").textContent = pick(["Yes! 🌟", "Perfect! 🎉", "You got it! ✅", "Nice! 👏"]);
    $("feedback").className = "feedback good";
    // A retype right after the reveal — or after a "Show me again" peek — is
    // "aided": it earns the star but shouldn't count toward accuracy/mastery.
    const aided = state.missedThisItem || state.peeked;
    // one line per completed word for the parent's session drill-down:
    // ok = right on the first try (a requeued word is its own line again)
    (state.sessionWords || (state.sessionWords = []))
      .push({ w: state.target, ok: !aided });
    postAnswer(state.target, true, aided);
    if (!aided) {
      state.correctCount++;
      // in-session streak toast — a live micro-goal beyond the star
      state.sessionStreak++;
      if ([3, 5, 10].includes(state.sessionStreak)) {
        $("feedback").textContent += ` 🔥 ${state.sessionStreak} in a row!`;
      }
    }
    state.wordsDone++;
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
    state.sessionStreak = 0; // a miss quietly resets the streak (no downer)
    $("check").disabled = true; // no double-checking while the reveal loads
    boxes.classList.add("wrong");
    boxes.classList.add("shake");
    // Tell him how CLOSE he was — "wrong" and "99% right" must FEEL different.
    // The input is length-capped to the target, so every wrong attempt is the
    // same length and a positional diff is trivial. Mark the off boxes coral
    // so his eye jumps straight to what to fix.
    $("feedback").textContent = closenessMessage(val);
    $("feedback").className = "feedback bad";
    markOffBoxes(val);
    // re-queue this word once, later in the session, for extra practice.
    // Presentation is mode-driven (presentWordItem), so no stage is needed —
    // a requeued Hide & Spell word still hides on type like every other.
    if (!state.requeued &&
        ["words", "listen", "build"].includes(state.mode)) {
      state.requeued = true;
      const back = { w: state.target, group: "",
                     heart: state.itemHeart || undefined };
      const pos = Math.min(state.queue.length, 2 + Math.floor(Math.random() * 3));
      state.queue.splice(pos, 0, back);
      state.total++;
    }
    setTimeout(() => {
      // Map it: reveal the answer segmented into grapheme chunks (b|oa|t) so
      // the retype is phoneme-grapheme mapping, not letter-copying.
      renderRevealBoxes(state.target, state.itemHeart); // resets .boxes class...
      boxes.classList.add("reveal");                    // ...so add reveal after
      $("prompt-word").innerHTML = heartSpans(state.target, state.itemHeart);
      $("prompt-word").classList.remove("gone");
      $("prompt-hint").textContent = state.itemHeart
        ? "The red part is the tricky bit — learn it by heart ♥"
        : "See the chunks? Build it chunk by chunk 🧩";
      $("feedback").textContent = ""; // don't leave "Almost!" under the answer
      $("feedback").className = "feedback";
      $("check").classList.add("hidden");
      $("next").classList.remove("hidden");
      $("next").textContent = "Try again";
      // Multisensory correction: hear-see-type is what works for him, so at
      // the moment that matters most, say + spell the right answer (only when
      // audio is already in play — autoplay on, or the audio-only listen game;
      // the next keystroke calls stopSpeech() so it can't just be copied).
      if (state.autoplayAudio || state.mode === "listen") {
        speakWordAndSpell(state.target);
      }
    }, 900);
  }
}

function advance() {
  // memory mode: "I'm ready!" flips from reading to typing from memory
  if (state.memorizing) { startMemoryTyping(); return; }
  // if this was a "try again" retry, re-present the same word
  if (state.missedThisItem && !state.answered) {
    resetItemUI();
    if (state.mode === "build") {
      beginBuildItem(state.buildItem, true); // fresh scramble for the retype
    } else if (state.sentence) {
      const tok = state.sentence.tokens[state.sentence.wordIdx];
      // after a reveal the word is no secret — show it for the retype
      state.curHidden = false;
      renderCurrentSentence();
      beginWord(tok.display, "Try again — you can do it!", true, false, tok.heart);
    } else {
      beginWord(state.target, "Try again — you can do it!",
        false, false, state.itemHeart);
      maybeAutoplayWord(); // re-shown for the retype → say + spell again
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
  // stars are IN-SESSION feedback only (owner 2026-07-12): the pill counts
  // this session's +1s and that's the whole star system — no lifetime total
  $("play-points").textContent = "+" + state.earned;
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
  const wasQuest = state.quest;
  const secs = Math.round((Date.now() - (state.sessionStart || Date.now())) / 1000);
  $("badge-earns").innerHTML = ""; // clear last session's celebration
  showNextBadge(null);
  // a Quest offers "one more game?" (nudges another go without a treadmill);
  // a normal session offers "Play again" (same game, same goal)
  $("more-games").classList.toggle("hidden", !wasQuest);
  $("again").classList.toggle("hidden", !!wasQuest);
  postJSON("/api/session_end", {
    mode: state.mode,
    count: state.wordsDone,
    correct: state.correctCount,
    points: state.earned,
    seconds: secs,
    words: (state.sessionWords || []).slice(0, 60),
    child: state.childId,
    assignment: state.assignment || undefined,
    quest: state.quest || undefined,
  }).then((r) => {
    if (r.new_badges && r.new_badges.length) celebrateBadges(r.new_badges);
    else showNextBadge(r.next_badge); // nudge only when not celebrating
    if (r.assignment_done || (r.new_badges || []).length) {
      refreshState().catch(() => {}); // mission card + badge count refresh
    }
  }).catch(() => {});
  state.assignment = null;
  state.quest = false;
  $("done-words").textContent = state.wordsDone;
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
  $("peek-btn").addEventListener("click", doPeek);
  $("tile-undo").addEventListener("click", undoTile);
  $("quit").addEventListener("click", () => { goHome(); });
  $("speaker").addEventListener("click", speakCurrent);

  // Keep the keyboard from bouncing between words. Tapping Check / Next / 🔊
  // (or the letter boxes) would normally move focus off the text field, which
  // closes the iOS keyboard — it then reopens on the next word and the screen
  // resizes each time. Preventing the default on pointer-down keeps focus in
  // #typed (the click still fires), so the keyboard stays up all session.
  ["check", "next", "speaker", "boxes", "peek-btn", "tile-undo"].forEach((id) => {
    $(id).addEventListener("mousedown", (e) => e.preventDefault());
  });
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
// A generation counter (not a stored utterance) tracks the "current" speech
// job: any new speakParts() or stopSpeech() bumps it, so stale onend/onstart
// callbacks from a cancelled job are ignored — no races, no GC of live audio.
// Rates are parent-tunable per child (state.wordRate / state.spellRate).
let speechGen = 0;

// Speak a list of {text, rate} parts in order — the next starts when the
// previous ends. Lets the word read at normal speed and the spelling slower.
function speakParts(parts) {
  const synth = window.speechSynthesis;
  parts = (parts || []).filter((p) => p && p.text);
  if (!synth || !parts.length) return;
  const gen = ++speechGen;
  try { synth.resume(); } catch (_) {}
  const queue = parts.slice();
  const runNext = () => {
    if (gen !== speechGen) return;              // superseded/cancelled
    if (!queue.length) { $("speaker").classList.remove("speaking"); return; }
    const part = queue.shift();
    const u = new SpeechSynthesisUtterance(part.text);
    u.rate = part.rate || 0.8;
    u.lang = "en-US";
    u.onstart = () => { if (gen === speechGen) $("speaker").classList.add("speaking"); };
    u.onend = () => { if (gen === speechGen) runNext(); };
    u.onerror = () => { if (gen === speechGen) $("speaker").classList.remove("speaking"); };
    synth.speak(u);
  };
  // an in-flight job gets cancelled; iOS drops a speak() right after cancel(),
  // so let it settle first (the gen guard ignores the old job's callbacks)
  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(runNext, 90);
  } else {
    runNext();
  }
}

// say a word (or sentence) at the child's word-reading speed
function speakText(text) { speakParts([{ text: text, rate: state.wordRate }]); }

// say the word, then spell it slower — "planet"  then  "p. l. a. n. e. t"
function spellLetters(word) {
  const names = { "'": "apostrophe", "-": "dash" };
  return word.split("").map((c) => names[c] || c).join(". ");
}
function speakWordAndSpell(word) {
  speakParts([{ text: word, rate: state.wordRate },
              { text: spellLetters(word), rate: state.spellRate }]);
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

// Stop any audio immediately — used the moment the kid starts typing, so the
// spoken spelling can't be copied letter-for-letter.
function stopSpeech() {
  const synth = window.speechSynthesis;
  if (!synth) return;
  speechGen++;                 // invalidate the running sequence
  try { synth.cancel(); } catch (_) {}
  $("speaker").classList.remove("speaking");
}

// Parent accommodation: when a word is SHOWN (Copy It / Hide & Spell) and the
// child has auto-play on, say the word and spell it. onType() stops it the
// instant he types so it can't be used to copy.
function maybeAutoplayWord() {
  if (!state.autoplayAudio) return;
  if (!["copy", "words", "build"].includes(state.mode)) return;
  if (!("speechSynthesis" in window) || !state.target) return;
  speakWordAndSpell(state.target);
}

function speakCurrent() {
  if (!("speechSynthesis" in window)) return;
  if (state.mode === "memory" && state.sentence) {
    speakText(state.sentence.s); // dictation: always the whole sentence
  } else if (state.mode === "sentences" && state.sentence) {
    const tok = state.sentence.tokens[state.sentence.wordIdx];
    if (tok) speakText(tok.answer);
  } else if (state.mode === "copy" || state.mode === "words" ||
             state.mode === "build") {
    // spell it out ONLY before he's started building/typing this word; once
    // he's begun (the word has hidden), just say the name so it can't be copied
    if (state.typedStarted) speakText(state.target);
    else speakWordAndSpell(state.target);
  } else {
    speakText(state.target); // listen / pick: word only, never spelled
  }
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

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
  // "One more game?" after a Quest: go to the games menu (autonomy — let him
  // pick, don't drop him straight back onto a treadmill)
  $("more-games").addEventListener("click", () => {
    goHome();
    document.querySelectorAll(".game-set").forEach((g) =>
      g.classList.toggle("hidden", g.dataset.set !== "words"));
    showPanel("games");
  });
  $("home-btn").addEventListener("click", goHome);
}

function goHome() {
  resetHomeMenu(); // full menu again, chips tucked away
  state.assignment = null; // quitting a mission leaves it on the list
  refreshState().catch(() => {});
  state.sentence = null;
  state.memorizing = false;
  stopSpeech();
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
    b.textContent = c.name;
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
  $("s-streak").textContent = rep.summary.streak_days ?? 0;
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
    ["memory", "🙈 From memory", "var(--amber)"],
    ["copy", "👀 Copying", "#d9cfc0"],
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

  const bm = rep.by_mode || {};
  const mml = $("modes-list");
  mml.innerHTML = "";
  const activeModes = Object.keys(MODE_LABELS)
    .filter((k) => bm[k] && (bm[k].seen > 0 || bm[k].points > 0));
  if (!activeModes.length) {
    mml.innerHTML = '<li class="muted">Nothing yet.</li>';
  } else {
    activeModes.forEach((k) => {
      const m = bm[k];
      const acc = m.seen ? Math.round((100 * m.correct) / m.seen) : 0;
      const li = document.createElement("li");
      li.innerHTML = `<span class="mode-name">${MODE_LABELS[k]}</span>` +
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
      const label = MODE_LABELS[s.mode] || s.mode;
      const score = `${s.correct}/${s.count} right`;
      if (!s.words || !s.words.length) {
        // sessions from before word tracking — plain row, nothing to open
        li.innerHTML = `<span>${when} · ${esc(label)}</span><span>${score}</span>`;
      } else {
        // clickable: opens the actual words — misses first, each with its
        // category, so the parent sees WHAT went wrong, not just the score
        li.className = "sess-li";
        const det = document.createElement("details");
        det.className = "sess";
        det.innerHTML = `<summary><span class="tri">▶</span>` +
          `<span>${when} · ${esc(label)}</span>` +
          `<span class="sess-score">${score}</span></summary>`;
        const body = document.createElement("div");
        body.className = "sess-words";
        const order = [...s.words.filter((w) => !w.ok),
                       ...s.words.filter((w) => w.ok)];
        order.forEach((w) => {
          const row = document.createElement("div");
          row.className = "sess-word" + (w.ok ? " ok" : " miss");
          row.innerHTML = `<span class="sw-mark">${w.ok ? "✓" : "✗"}</span>` +
            `<span class="sw-word">${esc(w.w)}${w.heart ? heartMark() : ""}</span>` +
            `<span class="sw-group">${esc(w.group || "school word")}</span>`;
          body.appendChild(row);
        });
        det.appendChild(body);
        li.appendChild(det);
      }
      sl.appendChild(li);
    });
  }
  renderTypes(rep);

  // word sources: the custom lists first (the bank's copy-target dropdown
  // needs them cached), then the bank with its grade bands
  renderParentBadges(rep.badges, rep.trip);
  renderAssignments(rep);
  renderProgress(rep.progress);
  renderLists(rep.lists || []);
  renderBank(rep.bank);
  $("hearts-only").checked = rep.profile.hearts_only === true;
  updateHeartsNote(rep.hearts_in_pool);
  updateNoWordsNote(rep.sources_empty);

  renderDeviceChips(rep.children);
  $("set-name").value = rep.profile.name || "";
  $("set-speaker").checked = rep.profile.show_speaker !== false;
  $("set-autoplay").checked = rep.profile.autoplay_audio === true;
  setRateSlider("set-word-rate", "word-rate-val", rep.profile.word_rate || 0.8);
  setRateSlider("set-spell-rate", "spell-rate-val", rep.profile.spell_rate || 0.45);
  $("set-pin").value = "";
  $("settings-saved").textContent = "";
  if (lsGet("push-parent")) $("notif-btn").textContent = "🔔 On for this device ✓";
  // a child can be removed only while a sibling remains
  const rc = $("remove-child");
  rc.classList.toggle("hidden", (rep.children || []).length < 2);
  rc.textContent = `Remove ${rep.profile.name || "this child"}…`;
}

// Which child does THIS DEVICE practice as? Parent-only (the kid's home
// screen has no switcher, so kids can't do each other's work). The pick is
// stored on the device and applies the moment it's tapped — independent of
// the dashboard tab above, which only chooses what the PARENT is looking at.
function renderDeviceChips(children) {
  const block = $("device-setting");
  const wrap = $("device-chips");
  wrap.innerHTML = "";
  const kids = children || [];
  block.classList.toggle("hidden", kids.length < 2);
  kids.forEach((c) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "device-chip" + (c.id === state.childId ? " active" : "");
    b.textContent = c.name;
    b.addEventListener("click", () => {
      if (c.id === state.childId) return;
      state.childId = c.id;
      storeChild(c.id);
      refreshState().catch(() => {});  // home greeting follows immediately
      renderDeviceChips(kids);
    });
    wrap.appendChild(b);
  });
}

// ---------- Word types (targeted instruction: results by category) ----------
// US classrooms teach spelling by FEATURE — long-vowel teams, r-controlled
// vowels, endings — so the analysis groups his results the same way. A
// category with enough tries and low accuracy floats to the top with an
// "Assign practice" button: one tap hands him a mission on just that type.
function typeGradeTag(level) {
  const g = Math.floor(level);
  return ORDINAL[g - 1] + (level - g >= 0.5 ? "+" : "");
}

function renderTypes(rep) {
  const list = $("types-list");
  const restWrap = $("types-rest-wrap");
  const rest = $("types-rest");
  if (!list) return;
  list.innerHTML = "";
  rest.innerHTML = "";
  const all = rep.by_type || [];
  if (!all.length) {
    list.innerHTML = '<li class="muted">Results by word type appear here once he practices.</li>';
    restWrap.classList.add("hidden");
    return;
  }
  const needy = all.filter((t) => t.needs_work);
  const fine = all.filter((t) => !t.needs_work);

  const row = (t, withAssign) => {
    const li = document.createElement("li");
    li.className = "type-row" + (withAssign ? " needs-work" : "");
    let html =
      `<div class="type-top"><span class="type-name">${esc(t.name)}` +
      ` <span class="type-grade">${typeGradeTag(t.level)}</span></span>` +
      `<span class="type-acc${t.accuracy < 80 ? " low" : ""}">${t.accuracy}%</span></div>` +
      `<div class="type-meta">${t.practiced} of ${t.total} tried · ` +
      `${t.seen} tries` + (t.mastered ? ` · ★${t.mastered}` : "") + `</div>`;
    if (t.trouble && t.trouble.length) {
      html += `<div class="prog-trouble">Still tricky: ` + t.trouble.map((w) =>
        `<span class="wr-miss">${esc(w.word)} ✗${w.missed}</span>`).join("&ensp;") +
        `</div>`;
    }
    if (withAssign) {
      html += `<button class="mini-btn type-assign">📋 Assign practice</button>`;
    }
    li.innerHTML = html;
    const btn = li.querySelector(".type-assign");
    if (btn) btn.addEventListener("click", () => {
      btn.disabled = true;
      // Hide & Spell on just this category — his misses are picked first
      assignCall({ action: "create", mode: "words", group: t.name });
    });
    return li;
  };

  if (!needy.length) {
    list.innerHTML = '<li class="muted">Nothing needs extra work right now 🎉</li>';
  } else {
    needy.forEach((t) => list.appendChild(row(t, true)));
  }
  restWrap.classList.toggle("hidden", !fine.length);
  $("types-rest-n").textContent =
    `${fine.length} type${fine.length === 1 ? "" : "s"}`;
  fine.forEach((t) => rest.appendChild(row(t, false)));
}

// ---------- Assignments (parent hands out missions) ----------
function renderAssignments(rep) {
  // what to practice: his checked words, a school list, one word TYPE
  // (category), or a whole grade band — values carry a prefix so one
  // dropdown can hold all four kinds of source
  const sel = $("assign-list");
  const lists = (rep.lists || []).map((l) =>
    `<option value="list:${esc(l.id)}">${esc(l.name)}</option>`).join("");
  const tg = rep.type_groups || [];
  const types = tg.filter((g) => !g.general).map((g) =>
    `<option value="group:${esc(g.name)}">${esc(g.name)} · ${typeGradeTag(g.level)}</option>`).join("");
  const bands = (rep.bank && rep.bank.bands || []).map((b) =>
    `<option value="band:${b.level}">${gradeLabel(b.level)}</option>`).join("");
  sel.innerHTML = '<option value="">his checked words</option>' +
    (lists ? `<optgroup label="School lists">${lists}</optgroup>` : "") +
    `<optgroup label="Word types">${types}</optgroup>` +
    `<optgroup label="Whole grades">${bands}</optgroup>`;
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
  const openGroups = new Set(
    [...wrap.querySelectorAll("details.bank-group[open]")].map((d) =>
      d.closest("details.band").dataset.level + "|" + d.dataset.group));
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

    // inside a grade: its CATEGORIES (phonics patterns, themes, sight
    // words, everyday grade words) — the parent picks types, not 300
    // individual words. Opening a category still shows every word in it.
    const bbody = document.createElement("div");
    bbody.className = "wlist-body";
    (band.groups || []).forEach((grp) => {
      const gd = document.createElement("details");
      gd.className = "bank-group" + (grp.enabled_count ? "" : " grp-off");
      gd.dataset.group = grp.name;
      if (openGroups.has(String(band.level) + "|" + grp.name)) gd.open = true;

      const gsum = document.createElement("summary");
      gsum.innerHTML = `<span class="tri">▶</span>` +
        `<input type="checkbox" aria-label="practice this category">` +
        `<span class="list-name">${grp.general ? "Everyday words" : esc(grp.name)}</span>` +
        `<span class="list-count">${grp.enabled_count}:${grp.total}</span>`;
      const gcb = gsum.querySelector("input");
      // tri-state: checked = all on · dash = some on · empty = none on
      gcb.checked = grp.enabled_count === grp.total;
      gcb.indeterminate = grp.enabled_count > 0 && grp.enabled_count < grp.total;
      gcb.addEventListener("click", (e) => e.stopPropagation());
      gcb.addEventListener("change", () => {
        gd.classList.toggle("grp-off", !gcb.checked); // grey instantly
        listsCall({ action: "bank_toggle_group", group: grp.name,
                    enabled: gcb.checked }).catch(listsFail);
      });
      gd.appendChild(gsum);

      const gbody = document.createElement("div");
      gbody.className = "wlist-body";
      const rows = document.createElement("div");
      rows.className = "word-rows";
      grp.words.forEach((it) => {
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
      gbody.appendChild(rows);

      // copy just this category into a custom list — one tap
      const gcopy = document.createElement("div");
      gcopy.className = "wlist-actions";
      gcopy.innerHTML = `<button class="mini-btn">Copy to a list</button>`;
      gcopy.querySelector("button").addEventListener("click", () => {
        listsCall({ action: "bank_copy", group: grp.name,
                    name: grp.general
                      ? gradeLabel(band.level) + " everyday words"
                      : grp.name }).catch(listsFail);
      });
      gbody.appendChild(gcopy);
      gd.appendChild(gbody);
      bbody.appendChild(gd);
    });

    // copy this grade's checked words into a custom list — no typing
    const copy = document.createElement("div");
    copy.className = "wlist-actions";
    const opts = cachedLists.map((l) =>
      `<option value="${esc(l.id)}">into: ${esc(l.name)}</option>`).join("");
    copy.innerHTML =
      `<select aria-label="copy target">` +
      `<option value="">as a new list</option>${opts}</select>` +
      `<button class="mini-btn">Copy grade</button>`;
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

// ---- audio-speed sliders (parent-tunable TTS rates) ----
function setRateSlider(sliderId, valId, rate) {
  $(sliderId).value = rate;
  $(valId).textContent = Number(rate).toFixed(2) + "×";
}
// the example is read at the slider's LIVE value so the parent hears the
// change immediately: word slider → a sample word; spell slider → spell it
function demoWordRate() {
  speakParts([{ text: "spelling", rate: parseFloat($("set-word-rate").value) }]);
}
function demoSpellRate() {
  speakParts([{ text: spellLetters("spelling"),
               rate: parseFloat($("set-spell-rate").value) }]);
}
function wireRateSlider(sliderId, valId, saveKey, stateKey, demoFn) {
  const s = $(sliderId);
  s.addEventListener("input", () => {
    $(valId).textContent = parseFloat(s.value).toFixed(2) + "×";
  });
  s.addEventListener("change", () => {              // fires on release
    const val = parseFloat(s.value);
    state[stateKey] = val;                           // preview uses it too
    demoFn();                                        // read the example back
    postJSON("/api/parent/settings",
      { pin: state.parentPin, child: state.parentChild, [saveKey]: val })
      .then(() => refreshState().catch(() => {}))    // device kid picks it up
      .catch(() => {});
  });
}

function wireParent() {
  wireRateSlider("set-word-rate", "word-rate-val", "word_rate", "wordRate", demoWordRate);
  wireRateSlider("set-spell-rate", "spell-rate-val", "spell_rate", "spellRate", demoSpellRate);
  $("word-rate-demo").addEventListener("click", demoWordRate);
  $("spell-rate-demo").addEventListener("click", demoSpellRate);

  $("assign-mode").addEventListener("change", () => {
    // sentence tests come from the sentence bank, not a word list
    const m = $("assign-mode").value;
    $("assign-list").disabled = m === "sentences" || m === "memory";
  });
  $("assign-create").addEventListener("click", () => {
    const body = { action: "create",
                   mode: $("assign-mode").value,
                   all_children: $("assign-all").checked || undefined };
    const src = $("assign-list").value; // "list:ID" | "group:NAME" | "band:LEVEL"
    if (src.startsWith("list:")) body.list_id = src.slice(5);
    else if (src.startsWith("group:")) body.group = src.slice(6);
    else if (src.startsWith("band:")) body.level = parseFloat(src.slice(5));
    assignCall(body);
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
      autoplay_audio: $("set-autoplay").checked,
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

  $("reset-progress").addEventListener("click", async () => {
    const name = $("set-name").value || "this child";
    if (!confirm(`Reset ALL of ${name}'s practice progress? Every word starts over. ` +
                 "Word lists and settings are kept. This can't be undone.")) return;
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
