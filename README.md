# 🐕‍🦺 Cerberus CI

**AI-powered test-health and performance-regression gate for CI pipelines.**

> *"Cerberus watches your CI test history, tells you which failures are real regressions vs. flaky noise, catches performance regressions before they ship, and posts a plain-English quality report on every pull request."*

## Why Cerberus?

Every team with a CI pipeline eventually hits two related problems:

1. **Flaky tests erode trust.** A test fails intermittently for reasons unrelated to the code change. Over time, engineers start ignoring red CI, which means real regressions slip through.

2. **Performance regressions are invisible until a user complains.** Functional tests check "does it work," but almost nobody gates a PR on "did this change make the checkout flow 300ms slower."

Cerberus solves both by sitting on top of existing CI test runs (it does not replace Playwright/Jest/etc.) and adding a historical, intelligent layer on top.

## The Name

Named after the three-headed dog of Greek mythology that guards the gate to the underworld. The three heads map to the three-tier classification pipeline:

1. **Rule-based pre-filter** — deterministic rules (no AI)
2. **Verdict cache** — avoids re-classifying known failures
3. **AI classification** — for genuinely new, ambiguous errors

This is architecture-as-naming, not just a vibe.

## Features

- **Three-tier classification** — rules → cache → AI (cheapest check first)
- **Provider-agnostic AI** — Claude (default), OpenAI-compatible (covers OpenAI, OpenRouter, Groq, Ollama, etc.), or mock mode
- **Performance regression detection** — statistical comparison against branch baselines
- **Deterministic gate** — AI never makes the pass/fail decision, only classifies
- **Zero-cost mock mode** — fully testable without any API key
- **GitHub Action** — installable via `uses:` in any repo
- **PR comments** — plain-English quality reports on every pull request
- **Config validation** — catches misconfigurations early with clear error messages
- **Test history** — view pass/fail trends and flaky scores for individual tests
- **Trends analysis** — detect worsening/improving flaky test patterns across runs
- **JSON output** — machine-readable results for CI script integration
- **Full pipeline command** — `cerberus run` executes ingest → classify → gate → report in one shot
- **Database migrations** — schema evolves safely across versions
- **Multiple input files** — ingest results from multiple test suites in one command
- **Run comparison** — diff two runs side-by-side showing new failures, resolved issues, and performance deltas
- **GitHub Actions annotations** — regressions show as `::error`, flaky tests as `::warning` inline on the PR Files tab
- **Manual performance baselines** — mark known-good runs as baselines to compare against

## Quick Start

### As a GitHub Action

```yaml
- uses: EvertonSt/cerberus-ci-action@v1
  with:
    ai-provider: claude
    ai-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    github-token: ${{ secrets.GITHUB_TOKEN }}
    test-results-path: ./test-results/results.json
```

### As a CLI

```bash
# Install
npm install -g cerberus-ci

# Initialize config
cerberus init

# Full pipeline in one command
cerberus run -i results.json -f playwright-json \
  --run-id $CI_RUN_ID --commit $SHA --branch $BRANCH --pr $PR_NUMBER

# Or run each step individually
cerberus ingest -i results.json -f playwright-json \
  --run-id $CI_RUN_ID --commit $SHA --branch $BRANCH --pr $PR_NUMBER
cerberus classify --run-id $CI_RUN_ID
cerberus gate --run-id $CI_RUN_ID
cerberus report --run-id $CI_RUN_ID --pr $PR_NUMBER --repo owner/repo

# Inspect a run
cerberus status --run-id $CI_RUN_ID

# View test history and trends
cerberus history --test "checkout.spec.ts:42" --branch main

# Analyze flaky test trends across runs
cerberus trends --branch main

# Compare two runs side-by-side
cerberus compare --run-id $RUN_ID_B  # auto-selects previous run
cerberus compare --run-id $RUN_ID_B --other-run-id $RUN_ID_A

# Set a known-good run as performance baseline
cerberus baseline set --run-id $GOOD_RUN_ID --label "v1.0 release"
cerberus baseline list
cerberus baseline clear

# Emit GitHub Actions annotations (inline PR feedback)
cerberus gate --run-id $CI_RUN_ID --annotations
cerberus run -i results.json -f playwright-json \
  --run-id $CI_RUN_ID --commit $SHA --branch $BRANCH --annotations

# JSON output for CI scripts
cerberus run -i results.json -f playwright-json \
  --run-id $CI_RUN_ID --commit $SHA --branch $BRANCH --json
```

## Provider-Agnostic Architecture

Cerberus is not vendor-locked. The AI provider abstraction means switching between providers is a config change, not a code change:

```yaml
# Claude (default)
ai:
  provider: claude
  model: claude-sonnet-4-6
  api_key_env: ANTHROPIC_API_KEY

# OpenAI
ai:
  provider: openai-compatible
  base_url: https://api.openai.com/v1
  model: gpt-4
  api_key_env: OPENAI_API_KEY

# Local Ollama
ai:
  provider: openai-compatible
  base_url: http://localhost:11434/v1
  model: llama3
  api_key_env: null
```

The `openai-compatible` adapter speaks the standard `chat/completions` request shape, which transparently covers OpenAI, OpenRouter, Groq, Together AI, DeepSeek, Ollama, LM Studio, and more.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Actions CI                          │
│                                                               │
│   [existing test suite] → JUnit XML / Playwright JSON        │
│                        │                                      │
│                        ▼                                      │
│              ┌──────────────────┐                            │
│              │  cerberus ingest  │  ← CLI command             │
│              └────────┬─────────┘                            │
│                       │                                       │
│                       ▼                                       │
│              ┌──────────────────┐                            │
│              │  SQLite (local)   │  historical run data       │
│              └────────┬─────────┘                            │
│                       │                                       │
│       ┌───────────────┼────────────────┐                     │
│       ▼               ▼                ▼                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐               │
│  │ Flaky     │  │ Perf     │  │ AI Summary   │               │
│  │ Classifier│  │ Regression│  │ Generator    │               │
│  └─────┬─────┘  └─────┬────┘  └──────┬───────┘               │
│        └───────────────┼──────────────┘                      │
│                        ▼                                      │
│              ┌──────────────────┐                            │
│              │  cerberus gate    │  ← exit code 0/1           │
│              └────────┬─────────┘                            │
│                       │                                       │
│                       ▼                                       │
│              PR comment via GitHub API                       │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

See [`cerberus.config.example.yml`](cerberus.config.example.yml) for the full configuration reference.

Key options:

| Option | Default | Description |
|--------|---------|-------------|
| `ai.provider` | `claude` | AI provider to use |
| `classifier.consecutive_failures_threshold` | `3` | Auto-classify as regression after N consecutive failures |
| `perf.baseline_branch` | `main` | Branch to compare performance against |
| `perf.threshold_pct` | `20` | Flag regression if >20% slower than baseline |
| `gate.fail_on_regression` | `true` | Fail build on any regression |
| `gate.max_new_flaky_tests` | `3` | Fail if too many flaky tests |

## Testing

Cerberus tests itself using its own philosophy:

```bash
npm test
```

- **237 unit + integration tests** covering all modules exhaustively
- **Gate logic** tested across every config flag combination
- **Cache behavior** verified (TTL expiration, signature normalization, cross-run deduplication)
- **Config validation** tested (15 validation rules)
- **Report generation** tested (markdown structure, deduplication markers, provider attribution)
- **Migration system** tested (schema evolution)
- **Multiple file ingestion** tested (multi-suite CI pipelines)
- **Trends analysis** tested (worsening/improving detection)
- **AI providers** mocked HTTP tested (ClaudeProvider, OpenAICompatibleProvider)
- **Performance module** tested (ingestion, regression detection, cold start, denylist)
- **Full pipeline** end-to-end tested (ingest → classify → gate → report)
- **GitHub Actions annotations** tested (format, escaping, summary, generateAnnotations)
- **Manual baselines** tested (set, list, clear, perf priority over branch history)
- **88%+ code coverage** with v8 provider
- **Zero external API cost** — all tests use MockProvider by default
- **Fixture-driven** — never hits a live GitHub repo or AI provider
- **ESLint + Prettier** — strict linting with zero warnings

## Demo

The included [demo workflow](.github/workflows/demo.yml) runs Cerberus against its own test suite (dogfooding), demonstrating the full pipeline end-to-end.

## License

MIT
