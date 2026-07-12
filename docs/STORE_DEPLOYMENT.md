# App Store / Google Play deployment — research & plan (2026-07-12)

Status: **research only — nothing here is implemented or scheduled.** The
owner asked what it would take to ship this app to the Apple App Store and
Google Play someday. This is the plan, from scratch, with the legal and
company questions answered as researched. **Nothing in this document is
legal advice**; before an actual launch, spend one hour with a lawyer who
does app/COPPA work — the whole point of the design below is to make that
conversation short.

**Pricing decision (owner, 2026-07-12): paid-upfront, ~$0.99–$1.99.** This
is the best-case monetization for a kids' app — see §6a for what charging
changes (banking/tax agreements, the 15% commission programs, a stronger
LLC recommendation) and what it deliberately doesn't (the kids/COPPA
story survives intact because the purchase happens on the *parent's* store
account before the child ever opens the app).

---

## TL;DR

| Question | Short answer |
|---|---|
| Can this app ship to the stores as-is? | No — it's a self-hosted family PWA. It needs a **local-first port** (move the engine into the client, all data on-device) and a native wrapper (Capacitor). That port is the real work; the paperwork is easy. |
| Parent controls: separate parent app/accounts? | **No — keep the PIN-gated parent area on the kid's device** (the owner's instinct). It's simpler, it's what the app already does, and it's the COPPA-cleanest design possible. Cross-device parent dashboards can come later via the family's own iCloud/Google accounts, never via our servers. |
| Do I need a company (LLC)? | **Not required — but recommended once the app charges money.** Both stores accept individual accounts. With paid downloads, an LLC (~$50–500 + small annual fees) buys liability separation, clean books (EIN + business bank account for the payouts), a company name on the listing, and a Google **organization** account that skips the painful 12-tester rule. |
| Legal exposure? | Still low. The compliance-critical properties are **ad-free, account-free, IAP-free, zero-data** — all kept. Charging $1–2 upfront adds tax/banking paperwork and ordinary business income, not a new privacy regime: the stores are the merchant of record and handle sales tax/VAT and refunds. |
| Licensing problems with the content? | Essentially none, with one caution: the word **LEGO** (see Trademarks). Word lists are public-domain/factual, sentences and facts are original text. |
| Cost to be on both stores | Apple **$99/year** + Google **$25 once** (+ optional LLC costs). |
| What do I keep of a $1.99 sale? | **~$1.69** per sale on both stores at the 15% small-developer rates (enrollment required on both — §6a); 30%/$1.39 if you skip enrolling. |

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
  company name on the listings, and clean banking for the payouts. With
  the paid-upfront decision made (§6a), the recommendation firms up:
  **form the LLC before launch** — commerce is exactly the point where the
  entity earns its keep (an EIN + a business bank account keep the store
  payouts and taxes cleanly separated from personal finances, and the
  Google org account skips the 12-tester rule as a bonus). It remains
  legally optional; individuals sell paid apps every day.
- Sequence if you do want the entity: LLC in your home state → EIN (free,
  IRS online) → D-U-N-S (free) → Apple org account + Google org account.
  Add ~2–4 weeks of calendar time for verifications.
- **Insurance**: general/media liability policies exist for app studios;
  overkill at this scale. Revisit only if downloads get serious.

## 6a. Charging for the app (paid-upfront, ~$0.99–$1.99)

**Why paid-upfront is the right model for THIS app.** Of every way to
monetize a kids' app, a small one-time price is the cleanest:

- The **purchase happens in the store, on the parent's account, before the
  child ever opens the app** — so the kids-policy commerce rules (parental
  gates before purchases, IAP restrictions) simply never trigger. Apple's
  Kids Category and Google's Families policy govern *in-app* commerce; a
  paid download has none.
- **COPPA analysis is unchanged.** Apple/Google process the payment and
  send aggregated payouts; the developer never receives a child's (or even
  the parent's) payment details. Zero-data stays zero-data.
- No ads, no subscriptions, no "free + unlock" IAP machinery to build,
  gate, and defend in review. (The freemium alternative — free download +
  one-time parent-gated unlock IAP — converts better commercially but adds
  the exact compliance surface this plan avoids. Skip it unless downloads
  someday justify the complexity.)
- Parents *trust* paid-upfront in the kids' space — it signals "no ads, no
  manipulation" better than any policy text. Teacher Approved and kids-app
  review sites treat it as a positive.
- Trade-off to accept: paid-upfront kills casual downloads. At $0.99–1.99
  that's fine — this is a "worth-it" purchase driven by word of mouth and
  store search, not a growth funnel.

**Commissions — enroll in BOTH small-developer programs or lose 15 points:**

| | Default | Reduced | How to get the reduced rate |
|---|---|---|---|
| Apple | 30% | **15%** | [App Store Small Business Program](https://developer.apple.com/app-store/small-business-program/) — must apply/enroll; eligibility is <$1M/yr proceeds (new developers qualify); accept the latest Paid Apps agreement first; the rate takes effect ~15 days after the fiscal month of approval. |
| Google | 30% above $1M | **15% on the first $1M/yr** | [Enroll in the 15% service-fee tier](https://support.google.com/googleplay/android-developer/answer/10632485?hl=en) — create the Account Group in Play Console, declare associated accounts, accept the tier's Terms of Service. |

Net on a $1.99 sale at 15%: **≈$1.69** (before income tax). On a $0.99
sale: ≈$0.84. Price tiers are picked from each store's price schedule;
both let you set per-country pricing or auto-derive it.

**Paperwork charging adds (one-time, ~an afternoon plus waiting):**
- Apple: accept the **Paid Applications agreement** (Schedule 2) in App
  Store Connect, and complete **banking + tax forms** (W-9 for a US
  individual/LLC) before a paid app can go live. Payouts arrive monthly
  above a small minimum threshold.
- Google: set up the **payments profile** (bank account, tax info) in the
  Play Console. Same idea, monthly payouts.
- Taxes: the stores act as **merchant of record** — they collect and remit
  sales tax/VAT worldwide and handle refunds/chargebacks; what lands in
  the bank is business income. As an individual that's Schedule C
  (self-employment) income; with the LLC it flows through the entity.
  Expect a 1099 from the platforms once payouts cross reporting
  thresholds. At $1–2/download this is beer money until it very suddenly
  isn't — which is exactly why the LLC + separate bank account from day
  one keeps it painless.
- Support: paid apps raise expectations — the listings need a working
  support email/URL, and refund requests (handled by the stores) sometimes
  arrive as support mail anyway.

**Testing note:** charging doesn't complicate testing. TestFlight builds
are always free for testers, and Google Play **license testing** lets the
12 closed-track testers install a paid app without paying.

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
| LLC (recommended now that the app charges) | ~$50–500 + annual | liability separation + clean payout banking; org account skips Google's 12-tester rule |
| D-U-N-S | free | only for org accounts |
| Privacy-policy hosting | ~free | a static page |
| Lawyer sanity check | ~1 hour billed | worth it once, before launch |
| Commission programs (both stores) | free to enroll | 15% instead of 30% — see §6a; ~$1.69 net per $1.99 sale |

Realistic effort, given the codebase (each phase shippable):

1. **Phase 0 — decisions & money plumbing** (days + verification waits):
   name search, form the LLC (+ EIN + business bank account), write the
   one-page privacy policy; open both developer accounts; accept Apple's
   Paid Applications agreement + banking/tax forms and Google's payments
   profile; enroll in both 15% commission programs (§6a).
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
   privacy labels, screenshots, pick the price tier (~$0.99–$1.99) per
   store; budget for one rejection-and-fix cycle (4.2 wrapper or
   kids-gate nitpicks are the likely notes).
6. **Phase 5 — launch & upkeep**: store updates replace the HomeHub
   auto-pull for store users; opt into Teacher Approved.

## 9. What deliberately does NOT change

- The HomeHub deployment: `server.py`, the hard rules in CLAUDE.md, the
  git-pull deploy loop — all continue untouched for Caleb's daily use.
- The design identity: **ad-free, account-free, IAP-free, zero-data** is
  not just the pedagogy stance — it is the entire compliance strategy.
  A small upfront price doesn't dent any of it (the store handles the
  money before the child ever appears); ads, in-app purchases, accounts,
  or telemetry would. Every store/legal obligation above gets dramatically
  harder the moment any of those change. Keeping the app exactly this kind
  of app is what makes shipping it tractable for one person.

## Sources

- [Apple Developer Program enrollment](https://developer.apple.com/programs/enroll/) · [memberships compared](https://developer.apple.com/support/compare-memberships/) · [D-U-N-S](https://developer.apple.com/help/account/membership/D-U-N-S/)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) (1.3, 2.3.7, 4.2, 5.1.4) · [Apple kids guidance](https://developer.apple.com/kids/)
- [Google Play closed-testing requirement for new personal accounts](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en)
- [Apple App Store Small Business Program (15%)](https://developer.apple.com/app-store/small-business-program/) · [Google Play 15% service-fee tier](https://support.google.com/googleplay/android-developer/answer/10632485?hl=en) · [Play service fees overview](https://support.google.com/googleplay/android-developer/answer/112622?hl=en)
- [Google Play Families policies](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en) · [Families program / Teacher Approved](https://play.google.com/console/about/programs/families/)
- [FTC: Complying with COPPA — FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · [FTC six-step compliance plan](https://www.ftc.gov/business-guidance/resources/childrens-online-privacy-protection-rule-six-step-compliance-plan-your-business)
- Webview/4.2 rejection field reports: [MobiLoud](https://www.mobiloud.com/blog/app-store-review-guidelines-webview-wrapper) · [Code2Native](https://code2native.com/blog/fix-app-store-rejection-42-webview)
