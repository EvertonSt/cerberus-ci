# Roadmap

Deferred work, in the order it is worth doing. This exists so the next session
does not have to reconstruct intent by reading
[SESSION-LEDGER.md](SESSION-LEDGER.md) end to end — the ledger records what
happened, this records what to do about what is missing.

Every item below was already admitted somewhere in this repository, either in
the README's _"What these checks do not prove"_ or in a ledger `NEXT` block.
Nothing here is a fresh criticism; this is a queue, with the reasoning moved out
of a chronological record and into a place you can work from.

Nothing here is committed to. The order is a judgement, not a promise.

---

## P0 — closes a gap this project already admits

### 1. Make the GitHub Action exercise this code

**Gap.** `action.yml` installs `cerberus-ci@0.1.0` from npm, and that package
predates this rebuild. So the Action — the distribution channel, the thing a
consumer actually installs — is not running the engine in this repository. It
has never run on GitHub at all. Its entry point has only ever been driven
locally against this repo's own CLI.

**Done when** either a version is published and `action.yml` points at it, or
`action.yml` checks out this repository and runs the CLI from source. The second
is honest sooner and costs nothing; the first is what a consumer needs.

**Why first.** Everything else here improves a tool that is already reachable.
This is the tool not being reachable.

### 2. Assert something visual in the e2e journey

**Gap.** The journey passed 5/5 while the dev server was refusing to serve the
page's own stylesheet. Nothing in it depends on a stylesheet arriving, so "the
site works" currently means "the HTML arrived and the headings are right".

**Done when** the journey asserts a computed style, a loaded font, or a
screenshot diff — something that fails when the page renders unstyled.

**Watch for.** This is the item most likely to be done badly. A screenshot diff
that nobody updates becomes a test that is always green. Assert a specific
computed property you can read in a failure message rather than a whole-image
comparison.

### 3. Put a real number on the core claim, or remove the claim

**Gap.** The product's premise is that it catches flaky tests and regressions
across real projects. No number from a real project appears anywhere. Performance
regression detection has been exercised only against fixtures, never against a
trace from a real production run of anything.

**Done when** it has been run against a real project's test results and the
figure is in the README with the project named — or the claim is deleted. The
ledger already frames this as "or remove the claim", and that half is a real
option, not a diplomatic one.

### 4. Decide whether the classifier earns its place

**Gap.** The model-based classifier has only been exercised against mocked HTTP
and the heuristic provider. No test here has called a live model API. Meanwhile
the deterministic rules stand on their own.

**Done when** someone answers, in writing, whether the classifier changes a
verdict the deterministic rules would have got wrong. If it does not, deleting it
is the honest outcome and should be recorded as such in
[docs/decisions/](docs/decisions/).

**Watch for.** This is a deletion candidate, not a hardening item. Treating it as
"needs more tests" is how unproven machinery stays in a codebase for years.

---

## P1 — hardens what already works

### 5. Fix the link checker's blind spot on untracked files

**Gap.** `scripts/check-links.ts` builds its file list from `git ls-files`, so a
newly created Markdown file is not link-checked until it is committed. On the
Argus rebuild this produced a green `verify:links` run that had checked 15 files
and 4 links when the truth was 16 and 9 — the run passed _vacuously_, because
the file it should have been checking did not exist as far as the tool was
concerned.

**Done when** the checker also sees untracked, non-ignored Markdown, or the gate
states plainly that it inspects only tracked files.

**Cheap.** Roughly a change of one function and a sentence in the output.

### 6. Guard the workflow's contracts with a test

**Gap.** Nothing in this repository reads `ci.yml`. A refactor could drop
`fetch-depth: 0` from the `readiness` job and the authorship gate would carry on
reporting PASS while proving nothing — which this README already identifies as
the failure mode, in a comment, where no test enforces it. The same applies to
the pinned action SHAs and `COREPACK_ENABLE_STRICT: "1"`.

**Done when** a test asserts the invariants the comments claim: full-history
checkout on the job that needs it, every third-party action pinned to a full
SHA, and the strict-corepack flag set. All three are load-bearing and all three
are currently one careless edit away from silently not happening.

### 7. Component tests for the site, or an explicit decision

**Gap.** The site has no component-level unit tests, and the engine's coverage
number covers `src/lib` and `src/cli` only — it says nothing about the React
components.

**Done when** the components have tests, or [docs/decisions/](docs/decisions/)
records that the e2e journey is the site's whole test story and why that is
acceptable. Item 2 is the cheaper half of this and should land first.

### 8. Re-check `braces` when a patched version exists

Open since the first audit. 3.0.3 is still the latest publish and `micromatch`
requires `^3.0.3`, so it is unfixable today — a dev-only high, with a clean
production audit. Worth a periodic look rather than a permanent footnote.

---

## P2 — reach

### 9. Deploy the site

Deploy-ready, not deployed. `vercel.json` is configured and the production build
is verified locally, which is an inference from a build, not an observation of a
deployment.

### 10. A test against a live model endpoint

Related to item 4 but narrower: one marked test that calls the real API and is
skipped without a key. It converts "the request shape has never been accepted
by a real endpoint" from a known unknown into a known risk.

---

## Already better than the sibling project — do not "fix" these

Recorded so a future session does not mistake working design for a smell:

- **`gate.sh` reports each step's own exit code.** Nothing is chained through a
  pipe, because `tsc | head` exits with `head`'s status. The Argus rebuild spent
  seven red runs on exactly that class of bug.
- **`continue-on-error` on the dev audit is deliberate, not a masked failure.**
  It is surface-calibrated per
  [ADR 0004](docs/decisions/0004-calibrate-the-audit-by-surface.md), production
  holds at `high`, dev at `critical`, and the following step independently fails
  if the exemption list grows without a reason. Nothing keys off the masked
  step's status.
- **`cerberus baseline` is about performance baselines, not known defects.** It
  is SQLite-backed and keyed by run id. It shares a word with the Argus
  known-defect baseline and nothing else; do not merge the two ideas by name.

## Known sharp edge, not scheduled

**Performance baselines have no expiry.** A baseline recorded from a run whose
application has since changed keeps being compared against, and the comparison
stops meaning anything without ever announcing that it has. Item 3's real-project
run is what would expose this; do not build expiry before then, because there
is no real data yet to calibrate the staleness threshold against.
