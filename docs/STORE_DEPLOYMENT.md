# App Store / Google Play deployment — research & plan (2026-07-12)

Status: **research only — nothing here is implemented or scheduled.** The
owner asked what it would take to ship this app to the Apple App Store and
Google Play someday. This is the plan, from scratch, with the legal and
company questions answered as researched. **Nothing in this document is
legal advice**; before an actual launch, spend one hour with a lawyer who
does app/COPPA work — the whole point of the design below is to make that
conversation short.

---

## TL;DR

| Question | Short answer |
|---|---|
| Can this app ship to the stores as-is? | No — it's a self-hosted family PWA. It needs a **local-first port** (move the engine into the client, all data on-device) and a native wrapper (Capacitor). That port is the real work; the paperwork is easy. |
| Parent controls: separate parent app/accounts? | **No — keep the PIN-gated parent area on the kid's device** (the owner's instinct). It's simpler, it's what the app already does, and it's the COPPA-cleanest design possible. Cross-device parent dashboards can come later via the family's own iCloud/Google accounts, never via our servers. |
| Do I need a company (LLC)? | **Not required.** Both stores accept individual accounts. An LLC is worth ~$50–500/yr for liability separation and a nicer store listing, and a Google **organization** account skips the painful 12-tester rule — but you can launch without one. |
| Legal exposure? | Low **if** the app stays free, ad-free, and collects zero data (all three are true today). The one real compliance regime is **COPPA + the stores' kids policies**, and a local-only app satisfies them almost by construction. |
| Licensing problems with the content? | Essentially none, with one caution: the word **LEGO** (see Trademarks). Word lists are public-domain/factual, sentences and facts are original text. |
| Cost to be on both stores | Apple **$99/year** + Google **$25 once** (+ optional LLC costs). |

---

## 1. Where the app is today vs. what stores need

Today: a stdlib-Python server (`server.py`) renders nothing and owns
everything — sessions, the ladder, badges, persistence in
`data/progress.json` — deployed on one family's HomeHub, front end a plain
HTML/JS PWA. One family, one server, parent dashboard synced across the
family's devices *because the server is the shared brain*.

A store app is the opposite shape: thousands of unrelated families, no
server of ours, each install self-contained. Two consequences:

1. **The engine must move into the client.** `server.py`'s pedagogy core
   (session building, `record_answer`/ladder, badges, quest, stats) is
   ~1,500 lines of logic over pure-data banks — very portable to JS. The
   banks (`wordbank.py`, `badgebank.py`, `factbank.py`) become generated
   JSON (a tiny build script keeps Python as the source of truth).
   Persistence becomes on-device storage (IndexedDB / the wrapper's native
   storage) instead of `progress.json`.
2. **Anything server-shaped comes out**: the git self-update, the
   `/api/version` poll + Update bar (stores own updates — Apple forbids
   swapping executable code remotely anyway), web push + VAPID (becomes
   native *local* notifications), `/.hub/status`.

The HomeHub deployment is unaffected — the store build would be a second
packaging of the same front end, not a replacement. Keeping `server.py`
authoritative for the home version and generating the JS engine from the
same specs (docs/SCORING.md is the contract) is the maintenance model.

## 2. Account model: how parents control things

**v1 (recommended): exactly what the app does now.** One device (the
kid's), the ⚙️ gear + PIN gates the parent dashboard, parents adjust word
lists/settings/missions right there. No accounts, no sign-in, no email, no
server. This is both the simplest build and the strongest privacy story a
kids' app can have — there is nothing to consent to because nothing leaves
the device.

**v2 (optional, later): family sync without our servers.** If parents-on-
their-own-phone becomes a must-have, sync the family document through the
family's *own* platform storage — CloudKit/iCloud on Apple, Google Drive
app-data on Android. The data moves inside the family's existing accounts;
the developer still never receives it, which keeps the COPPA analysis
essentially unchanged (still confirm with the lawyer at that point).
**Never** build v2 as "our cloud + user accounts" — that single decision
would drag in verifiable parental consent flows, data-safety disclosures,
breach obligations, and most of the legal budget.

One adaptation either way: Apple requires a **parental gate** in front of
any external links or commerce in Kids-category apps. The PIN pad already
functions as one; Apple's guidance favors gates an under-9 can't brute-
force (e.g., a spelled-out math/word challenge or hold-three-seconds
pattern). Cheap tweak: keep the PIN but present the *first* gate as an
adult-skill challenge, or simply have no external links at all (today the
app has none — keep it that way and the gate question nearly vanishes).

## 3. Packaging options

| Option | Effort | Verdict |
|---|---|---|
| **A. Stay a PWA** (Safari "Add to Home Screen" / installable web app) | none | Already works; no store presence, no discoverability, iOS PWAs are second-class. This is the current HomeHub distribution — fine for us, not a "launch". |
| **B. Capacitor wrapper** (one codebase → iOS + Android) | moderate | **Recommended.** Bundles the existing HTML/JS *locally* (no web view loading a URL), gives native TTS/notifications/haptics/storage via plugins. |
| C. TWA / PWABuilder (Play only) | low | Legitimate for Google Play, but doesn't solve iOS, and we'd still need the local-first port. Not worth splitting the toolchain. |
| D. Native rewrite (SwiftUI + Kotlin) | very high | Two codebases forever, for a UI that's already excellent in web tech. No. |

**The Apple 4.2 "minimum functionality" risk** (web-wrapper rejections) is
real but manageable: reviewers reject apps that are thin shells around a
website. Mitigations, all natural for us: web assets fully bundled in the
binary (no remote loads — airplane-mode test must pass, and a local-first
app passes trivially), native plugins actually used (TTS via the native
speech engine rather than WKWebView's `speechSynthesis`, local
notifications for streak reminders behind a parent setting, haptics on
correct answers), and app-like UI (it already is: an interactive game, not
pages). Hundreds of Capacitor/Ionic apps pass review; the ones that fail
load someone's website in a frame.

Platform adaptation checklist (beyond the engine port):
- TTS: swap `speechSynthesis` for a Capacitor TTS plugin (the iOS quirks
  module in `app.js` mostly disappears).
- Keyboard: the visual-viewport dance may simplify inside a native shell;
  re-test the keyboard-stays-open behavior on-device.
- Notifications: local notifications only (no push infrastructure), off by
  default, behind the parent gate — Kids policies restrict push in kids'
  apps, and we don't need it.
- Sound: respect the ring/silent switch behavior deliberately.
- Tablet layouts: both stores review iPad/tablet; the matrix suite already
  tests those sizes.

## 4. Store accounts & submission mechanics

### Apple
- **$99/year** [Apple Developer Program](https://developer.apple.com/programs/enroll/).
- **Individual** account: just an Apple ID + card; the store listing shows
  **your personal legal name** as the developer.
  **Organization** account: requires a real legal entity + a free
  [D-U-N-S number](https://developer.apple.com/help/account/membership/D-U-N-S/)
  (~5 business days); listing shows the company name.
- Distribution testing via TestFlight (up to 10k external testers, easy).
- Submission: privacy "nutrition label" (ours: *no data collected* — the
  best label there is), age-rating questionnaire, **Kids Category**
  election with an age band (6–8 or 9–11 fits), export-compliance
  question (standard HTTPS-only → exempt), review turnaround typically
  1–3 days per attempt.

### Google Play
- **$25 one-time** registration; ID verification.
- **The trap for personal accounts**: accounts created after Nov 13, 2023
  must run a **closed test with 12 opted-in testers for 14 continuous
  days** before production access
  ([policy](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)).
  Recruiting 12 real testers is genuinely annoying for a solo dev —
  **organization accounts are exempt**, which is the most practical
  argument for forming an LLC before the Google side.
- Data safety form (again: "no data collected/shared"), content rating
  questionnaire (IARC), target-audience declaration → **Families policy**
  applies ([policy](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en)).
- Optional upside: the **Teacher Approved** program — expert-panel-vetted
  kids' apps get a badge and placement; a free, ad-free, pedagogy-heavy
  spelling app is exactly its profile. Opt in at submission.

## 5. Kids compliance (the one regime that really applies)

This app is unambiguously **child-directed**, so both stores' kids regimes
apply regardless of what data it does or doesn't touch:

- **Apple Kids Category** (guidelines 1.3 / 5.1.4): no behavioral ads, no
  third-party analytics/PII transmission, parental gate before external
  links or commerce, and a **privacy policy is mandatory** even with zero
  collection. We satisfy all of it by having no ads, no analytics, no
  links, no commerce. ([Apple kids guidance](https://developer.apple.com/kids/))
- **Google Play Families**: target audience "children", no device
  identifiers transmitted from children, no precise location, appropriate
  content, COPPA self-certification.
- **COPPA** (the actual US law): it governs operators that **collect
  personal information online** from under-13s, and requires verifiable
  parental consent to do so ([FTC FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions)).
  The local-first design means the operator (you) never receives anything
  — no accounts, no telemetry, no crash reporting with identifiers, no
  ad SDKs, no persistent identifiers leaving the device. That is the
  cleanest possible COPPA posture: there is no collection to consent to.
  It must be *kept* true: adding any SDK (even free crash analytics) or
  any our-server sync re-opens the analysis. State-level kids' privacy
  laws trend the same direction — zero-data keeps clearing the bar.
- Still required even at zero data: a short **privacy policy** URL (a
  one-pager: "everything stays on your device; we collect nothing"), and
  honest store data-safety/privacy labels saying the same.

## 6. Company & legal protection

- **A company is not required.** Both stores onboard individuals. Two
  practical differences: Apple shows an individual's legal name publicly,
  and Google's 12-tester rule doesn't apply to organization accounts.
- **What an LLC buys** (~$50–$500 to form depending on state, plus small
  annual fees): separation of personal assets from app liability, the
  company name on the listings, cleaner banking if the app ever monetizes.
  For a free, ad-free, zero-data app the realistic liability surface is
  small; the honest framing is that the LLC is *cheap insurance plus
  convenience*, not a necessity. If it ever becomes a paid app or adds
  subscriptions, form the entity first (and get an EIN + separate bank
  account; Apple/Google payout agreements want tax info either way).
- Sequence if you do want the entity: LLC in your home state → EIN (free,
  IRS online) → D-U-N-S (free) → Apple org account + Google org account.
  Add ~2–4 weeks of calendar time for verifications.
- **Insurance**: general/media liability policies exist for app studios;
  overkill at this scale. Revisit only if downloads get serious.

## 7. Content licensing & trademarks

**Inbound (what the app uses):**
- Word lists: Dolch and Fry are public domain; the graded lists were
  compiled from published curriculum *sequences* (sources in
  docs/RESEARCH.md). Individual words are facts and not copyrightable;
  wholesale copying of a single publisher's exact ordered list is the only
  theoretical exposure, and the bank merged multiple sources with its own
  structure. Low risk; keep RESEARCH.md's source notes as the record.
- Sentences and the 90 facts: original text written for this app. Facts
  themselves aren't ownable; the phrasing is ours.
- Fonts/art/icons: system fonts, hand-drawn SVG/pixel art. Clean.
- **LEGO** is the one flag. Stating true facts about LEGO ("LEGO means
  'play well'") is nominative fair use and fine *inside* the app. But:
  never put LEGO (or any third-party mark) in the app **name, subtitle,
  keywords, screenshots, or marketing** — Apple guideline 2.3.7 and
  ordinary trademark prudence both say so. The kid-facing UI already says
  "letter blocks" (not LEGO) in Build It — keep that. Consider a small
  "not affiliated with the LEGO Group" line in the store description if
  the facts deck ships. Same logic applies to any brand in future facts.
- App **name**: "Spelling Practice" is generic (unprotectable but also
  unfindable). Before launch pick a distinctive name and search both
  stores + USPTO (free TESS search) for conflicts. The dino-rocket
  identity suggests names worth exploring when the time comes.

**Outbound (our code):** the repo has no LICENSE file, which means
all-rights-reserved by default — exactly right for a store app. Add a
copyright line. Nothing GPL or third-party is bundled (stdlib + original
code), so there are no license obligations to satisfy.

## 8. Costs & timeline

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/year | required |
| Google Play registration | $25 once | required |
| LLC (optional) | ~$50–500 + annual | skips Google's 12-tester rule via org account |
| D-U-N-S | free | only for org accounts |
| Privacy-policy hosting | ~free | a static page |
| Lawyer sanity check | ~1 hour billed | worth it once, before launch |

Realistic effort, given the codebase (each phase shippable):

1. **Phase 0 — decisions** (days): name search, entity yes/no, write the
   one-page privacy policy.
2. **Phase 1 — local-first port** (the real work): engine to JS, banks to
   generated JSON, on-device persistence, feature-flag out server-only
   bits. The Playwright suites port almost unchanged and are the safety
   net. This benefits the HomeHub version too (offline resilience).
3. **Phase 2 — Capacitor wrap**: iOS + Android projects, native TTS/
   notifications/haptics, icons/splash, tablet passes.
4. **Phase 3 — closed testing**: TestFlight; Play closed track (recruit
   the 12 testers early if on a personal account — they must stay opted
   in 14 continuous days).
5. **Phase 4 — submissions**: Kids Category + Families declarations,
   privacy labels, screenshots; budget for one rejection-and-fix cycle
   (4.2 wrapper or kids-gate nitpicks are the likely notes).
6. **Phase 5 — launch & upkeep**: store updates replace the HomeHub
   auto-pull for store users; opt into Teacher Approved.

## 9. What deliberately does NOT change

- The HomeHub deployment: `server.py`, the hard rules in CLAUDE.md, the
  git-pull deploy loop — all continue untouched for Caleb's daily use.
- The design identity: free of ads, accounts, analytics, and economies is
  not just the pedagogy stance — it is the entire compliance strategy.
  Every store/legal obligation above gets dramatically harder the moment
  any of those change. Keeping the app exactly this kind of app is what
  makes shipping it tractable for one person.

## Sources

- [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/) · [memberships compared](https://developer.apple.com/support/compare-memberships/) · [D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (1.3, 2.3.7, 4.2, 5.1.4) · [Apple kids guidance](https://developer.apple.com/kids/)
- [Google Play closed-testing requirement for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Google Play Families policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en) · [Families program / Teacher Approved](https://play.google.com/console/about/programs/families/)
- [FTC: Complying with COPPA — FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · [FTC six-step compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- Webview/4.2 rejection field reports: [MobiLoud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper) · [Code2Native](https://code2native.com/blog/fix-app-store-rejection-42-webview)
