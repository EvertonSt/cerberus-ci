# Cerberus CI — Architecture

> Technical design document for engineers evaluating the project's architecture and design decisions.

## Why This Document Exists

Cerberus is built on a core philosophy: **deterministic core, AI-assisted reasoning at the edges.** The pass/fail gate must never vary based on provider choice, latency, or availability. AI is used for classification and summarization — never as an opaque gatekeeper. This document explains how that philosophy maps to concrete architectural decisions.

---

## 1. Three-Tier Classification Pipeline

The project is named after Cerberus, the three-headed dog guarding the underworld gate. The three heads map to a three-tier classification pipeline where each tier is progressively more expensive:

```
Failed Test
    │
    ▼
┌─────────────────────────┐
│ Tier 1: Rule-Based       │  Cost: zero
│ Pre-filter               │  Latency: <1ms
│ (deterministic rules)    │  Resolves ~40% of failures
└────────────┬────────────┘
             │ (uncertain)
             ▼
┌─────────────────────────┐
│ Tier 2: Verdict Cache    │  Cost: zero
│ (error signature lookup) │  Latency: <5ms
│ (avoids re-classifying)  │  Resolves ~30% of failures
└────────────┬────────────┘
             │ (truly new error shape)
             ▼
┌─────────────────────────┐
│ Tier 3: AI Classification│  Cost: one API call
│ (provider.classify())    │  Latency: 1-5s
│ (only for new shapes)    │  Resolves ~30% of failures
└─────────────────────────┘
```

### Tier 1: Rule-Based Pre-filter

Pure functions, no I/O, no AI. These rules fire before any cache lookup or API call:

| Rule | Condition | Verdict | Confidence |
|------|-----------|---------|------------|
| Retry pass | `retry_count > 0` | flaky | 0.9 |
| Consistent failure | 3+ consecutive `F` in history | regression | 0.85 |
| Navigation timeout | error contains `timeout` + `navigation` | flaky | 0.8 |

**Design rationale:** These rules are cheap, deterministic, and cover the most common cases. A test that passed on retry is almost certainly flaky. A test that has failed 3+ times consecutively is almost certainly a real regression. Classifying these without AI eliminates ~40% of API calls.

### Tier 2: Verdict Cache

Before calling the AI provider, compute an `error_signature` — a SHA-256 hash of the normalized error message and stack trace. The normalization strips:

- Line numbers (`:42:10`)
- ISO timestamps
- UUIDs and hex strings (session IDs)
- Whitespace variations

Then query the `classifications` table for a matching signature from the same test within the last 30 days. If found, reuse that verdict.

**Why this matters:** Without caching, a single recurring flaky test triggers a fresh AI call on every CI run. With 50 flaky tests and 10 runs/day, that's 500 API calls/day for classification of the same failures. Cache reduces this to near-zero after the first classification of each unique error shape.

**Cache TTL:** Configurable (default 30 days). After TTL, the same error shape gets re-classified — useful if the AI provider's classification quality improves over time, or if the project gains more historical context.

### Tier 3: AI Classification

Only reached for genuinely new error signatures not seen in the cache. The AI receives:

```typescript
{
  testName: "checkout.spec.ts:42",
  errorMessage: "Timeout of 30000ms exceeded",
  stackTrace: "Error: Timeout...\n  at checkout.spec.ts:42",
  historyPattern: "PFPFP"  // newest→oldest
}
```

The system prompt instructs the model to distinguish flaky signals (timing, network, race conditions) from regression signals (assertion mismatches, consistent failures, business logic errors).

**Provider-agnostic design:** Both `ClaudeProvider` and `OpenAICompatibleProvider` implement the same `AIProvider` interface. The `OpenAICompatibleProvider` speaks the standard `chat/completions` request shape over raw `fetch` — no `openai` npm package needed. This one adapter transparently covers OpenAI, OpenRouter, Groq, Together AI, DeepSeek, Ollama, and LM Studio.

**Output validation:** Both real providers parse the AI response through `parseClassificationResult()`, which validates the JSON schema (verdict ∈ {flaky, regression}, confidence ∈ [0,1], reasoning is non-empty). Malformed output falls back to `verdict: 'regression'` with a warning — safe default that errs toward catching real bugs.

---

## 2. Database Schema

SQLite via `sql.js` (pure JavaScript, no native build required). The database is local to the CI runner and gitignored.

### Entity Relationship

```
runs (1) ──────< (N) test_results
runs (1) ──────< (N) perf_metrics
runs (1) ──────── (1) config_snapshots
test_results (1) <── (N) classifications
```

### Key Design Decisions

1. **`runs` table stores CI run metadata** — commit SHA, branch, PR number. This enables historical queries: "show me all runs for this branch."

2. **`test_results` stores individual test outcomes** — including `retry_count` for Playwright retries. Deduplication happens at parse time: Playwright retries the same test, producing multiple `results` entries; the parser uses the last result and stores `retry_count = results.length - 1`.

3. **`classifications` stores verdicts** — with `classified_by ∈ {rules, cache, ai, mock}` and nullable `ai_provider` for auditability. If you switch from Claude to OpenAI, you can see which provider classified each test historically.

4. **`config_snapshots` records the config at each run** — so thresholds and provider choice are auditable historically. A team can answer "why did this build fail?" by looking at both the config and the classifications.

5. **`error_signature` is the cache key** — normalized hash that strips dynamic content. Two runs producing the same normalized error text will have the same signature, enabling cache hits.

---

## 3. Performance Regression Detection

### Baseline Computation

The comparison baseline for a PR run is computed from the **target branch's** history (default: `main`), not the PR branch. This is statistically sound because:

- PR branches typically have 1-3 runs — insufficient for a stable baseline
- `main` has accumulated 10+ runs, providing a reliable rolling median

### Regression Formula

```
delta_pct = ((current_value - baseline_median) / baseline_median) * 100
regression = delta_pct > threshold_pct
```

The median is used (not mean) because it's robust to outlier runs.

### Cold Start Handling

If fewer than 3 historical runs exist on the baseline branch, the metric is flagged as "insufficient history" in the report but does NOT fail the build. This prevents false negatives on new metrics while the team builds up history.

### Metric Denylist

Noisy metrics can be excluded via `perf.exclude` in config. Excluded metrics are still recorded in the database for monitoring but don't gate the build.

---

## 4. Gate Logic

The gate is the one component that **never calls an AI provider.** It reads stored verdicts and applies deterministic rules:

```typescript
gateResult.passed = (
  (!config.gate.fail_on_regression || regressionCount === 0) &&
  (!config.gate.fail_on_unknown || unknownCount === 0) &&
  (!config.gate.fail_on_perf_regression || perfRegressionCount === 0) &&
  (flakyCount <= config.gate.max_new_flaky_tests)
)
```

**Why this separation matters:** If the gate called AI, then gate behavior could vary based on:
- Provider availability (API down = gate behavior changes)
- Provider latency (timeout = different result)
- Provider choice (Claude vs OpenAI might disagree)

By classifying at Phase 2 and gating at Phase 4, gate behavior is fully deterministic given the same DB state and config. This is a critical property for CI — engineers need to trust that the same code change produces the same gate outcome.

---

## 5. AI Provider Abstraction

### Interface

```typescript
interface AIProvider {
  readonly id: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
  summarize(input: SummaryInput): Promise<string>;
}
```

### Implementation Strategy

Rather than writing N vendor-specific adapters, ship exactly three:

1. **`ClaudeProvider`** — native `@anthropic-ai/sdk`, first-class default
2. **`OpenAICompatibleProvider`** — raw `fetch` against `chat/completions` endpoint. Covers the majority of the market because most providers have converged on this API shape
3. **`MockProvider`** — deterministic local heuristic for testing

**Why `OpenAICompatibleProvider` is sufficient:** The `chat/completions` request shape has become an industry standard. OpenAI, OpenRouter, Groq, Together AI, DeepSeek, Ollama, and LM Studio all serve this endpoint. Writing separate adapters for each would add complexity without meaningful benefit. The user just sets `base_url` and `model` — no code changes.

### Factory Pattern

```typescript
getProvider(config): AIProvider
```

- Reads `ai.provider` from config
- Checks `api_key_env` for a valid key
- Falls back to `MockProvider` if key is missing (with clear warning)
- Throws `ProviderError` for invalid configurations (e.g., `openai-compatible` without `base_url`)

### Mock Mode

When `CERBERUS_MOCK=1` or no API key is configured, `MockProvider` is used automatically. The mock uses a deterministic heuristic:

- Retry passes → flaky (confidence 0.9)
- Consistent failures → regression (confidence 0.85)
- Timeout/network/element-not-found → flaky (confidence 0.75)
- Assertion mismatches → regression (confidence 0.80)
- Mixed history → flaky (confidence 0.6)

This allows the entire pipeline to run and produce meaningful results without any API cost.

---

## 6. Error Signature Normalization

The cache relies on `error_signature` to match recurring failures. The normalization pipeline:

```
Raw error message + stack trace
    │
    ▼ Strip line numbers (:42:10 → removed)
    ▼ Strip ISO timestamps
    ▼ Strip UUIDs
    ▼ Strip hex strings (16+ chars)
    ▼ Normalize whitespace
    │
    ▼ SHA-256 hash (truncated to 16 hex chars)
    │
    ▼ error_signature
```

This means:
- `"Timeout of 30000ms at checkout.spec.ts:42:10"` and `"Timeout of 30000ms at checkout.spec.ts:58:3"` produce the **same** signature
- `"Error abc123-def456"` and `"Error 789abc-def012"` produce the **same** signature (UUID stripped)
- `"Expected 5 to equal 10"` and `"Expected 5 to equal 20"` produce **different** signatures (the assertion detail differs)

---

## 7. PR Comment Strategy

Cerberus posts a Markdown comment on PRs with:

1. **Gate result** (pass/fail) — prominent at the top
2. **Flaky test count** — non-blocking, informational
3. **Regression count** — blocking if `fail_on_regression` is true
4. **Performance deltas** — with threshold violations highlighted
5. **AI Analysis** (collapsible) — natural language summary from `provider.summarize()`
6. **Provider attribution** — which AI provider produced the classification

**Comment deduplication:** The report uses a hidden HTML marker (`<!-- cerberus-quality-gate -->`) to find and update existing Cerberus comments rather than creating new ones each run. This prevents comment spam on active PRs.

---

## 8. Testing Philosophy

Cerberus tests itself using its own philosophy:

- **Unit tests** for every module — classifier rules, cache lookups, gate logic (pure functions, exhaustively tested)
- **Integration tests** running the full pipeline end-to-end in mock mode
- **Fixture-driven** — never hits a live GitHub repo or AI provider
- **Zero API cost** — all tests use `MockProvider`

The test suite itself demonstrates the project's value proposition: Cerberus can analyze test results, classify failures, detect regressions, and generate reports — all without an API key.
