import type { Metadata } from "next";
import {
  Brain,
  Shield,
  BarChart3,
  Eye,
  GitBranch,
  Terminal,
  MessageSquare,
  RefreshCw,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/Section";
import { CodeBlock } from "@/components/CodeBlock";

export const metadata: Metadata = {
  title: "Features",
  description:
    "Everything Cerberus CI does to keep your test suite trustworthy and your builds fast.",
};

const features = [
  {
    icon: Brain,
    title: "Three-Tier Classification Pipeline",
    badge: "Core",
    description:
      "The three heads of Cerberus: rules → cache → AI. Each tier is progressively more expensive. The rule-based pre-filter resolves ~40% of failures with zero API cost. The verdict cache prevents re-classifying the same recurring failure shape. Only genuinely new error signatures reach the AI provider.",
    details: [
      "Rule-based tier: retry-pass, consecutive failures, timeout patterns",
      "Verdict cache: SHA-256 error signature with 30-day TTL",
      "AI tier: only for new, ambiguous error signatures",
      "Average API cost: <1 call per unique failure shape",
    ],
    code: `# The classifier runs automatically
cerberus classify --run-id $CI_RUN_ID

# Verdicts stored: flaky | regression | unknown
# Each classified_by: rules | cache | ai | mock`,
    language: "bash",
  },
  {
    icon: Shield,
    title: "Deterministic Gate",
    description:
      "The gate NEVER calls an AI provider. It reads stored verdicts and applies deterministic rules. This ensures gate behavior is 100% reproducible — the same code change always produces the same outcome, regardless of AI provider availability or latency.",
    details: [
      "Exit code 0 = pass, 1 = fail",
      "Configurable: fail_on_regression, fail_on_unknown, fail_on_perf_regression",
      "max_new_flaky_tests threshold",
      "Audit trail: every verdict records which provider classified it",
    ],
    code: `gate:
  fail_on_regression: true
  fail_on_unknown: false
  fail_on_perf_regression: true
  max_new_flaky_tests: 3`,
    language: "yaml",
    filename: "cerberus.config.yml",
  },
  {
    icon: BarChart3,
    title: "Performance Regression Detection",
    badge: "New",
    description:
      "Statistical comparison against branch baselines. Uses rolling median (robust to outliers) computed from the target branch's history. Supports manual baselines from known-good runs. Cold start is handled gracefully — insufficient history warns but doesn't fail.",
    details: [
      "Rolling median comparison (robust to outliers)",
      "Per-metric threshold overrides",
      "Manual baseline support (trust 1 run)",
      "Metric denylist for noisy metrics",
      "Cold start: warn, don't fail",
    ],
    code: `# Set a known-good baseline
cerberus baseline set --run-id $GOOD_RUN --label "v1.0 release"

# Check performance
cerberus gate --run-id $CI_RUN_ID

# page_load_ms: 800ms → 1100ms (+37.5%)
# ❌ Regression flagged (>20% threshold)`,
    language: "bash",
  },
  {
    icon: Eye,
    title: "Provider-Agnostic AI",
    description:
      "Two adapters cover the entire market. ClaudeProvider (native SDK) and OpenAICompatibleProvider (raw fetch, covers OpenAI, Groq, Ollama, and 20+ others). Switch with a config change — no code changes needed.",
    details: [
      "Claude: native @anthropic-ai/sdk",
      "OpenAI-compatible: raw fetch, chat/completions shape",
      "Covers OpenAI, OpenRouter, Groq, Together AI, DeepSeek, Ollama, LM Studio",
      "MockProvider: deterministic heuristic, zero cost",
      "Automatic fallback: missing API key → mock mode with warning",
    ],
    code: `# Switch from Claude to Ollama
ai:
  provider: openai-compatible
  base_url: http://localhost:11434/v1
  model: llama3
  api_key_env: null`,
    language: "yaml",
    filename: "cerberus.config.yml",
  },
  {
    icon: Terminal,
    title: "GitHub Action",
    description:
      "One line to add to your workflow. Cerberus handles the full pipeline: ingest, classify, gate, report. Works with any test framework that outputs JUnit XML or Playwright JSON.",
    details: [
      "Composite action — no Docker needed",
      "Supports all AI providers",
      "Configurable inputs for every option",
      "Gate result as output for downstream steps",
      "GitHub Actions annotations for inline PR feedback",
    ],
    code: `- uses: EvertonSt/cerberus-ci@v2.0.0
  with:
    ai-provider: claude
    ai-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    github-token: \${{ secrets.GITHUB_TOKEN }}
    test-results-path: ./test-results/results.json
    annotations: true`,
    language: "yaml",
    filename: ".github/workflows/ci.yml",
  },
  {
    icon: MessageSquare,
    title: "PR Comments",
    description:
      "Plain-English quality reports posted on every pull request. Deduplicated (updates existing comment, no spam). Includes gate status, flaky count, regression count, performance deltas, and a written verdict for every failure.",
    details: [
      "Markdown format with collapsible details",
      "Hidden marker for deduplication",
      "Updates existing comment, no spam",
      "AI-generated trend analysis (collapsible)",
      "Provider attribution footer",
    ],
  },
  {
    icon: GitBranch,
    title: "Run Comparison",
    description:
      "Diff two CI runs side-by-side. See new failures, resolved issues, status changes, and performance deltas at a glance. Auto-selects the previous run on the same branch.",
    details: [
      "New failures (🔴), resolved (🟢), unchanged (⚪)",
      "Performance deltas with percentage",
      "Auto-select previous run on same branch",
      "JSON output for CI scripts",
    ],
    code: `cerberus compare --run-id $RUN_B
# BEFORE: run-A (aaa111) @ 2026-01-10
# AFTER:  run-B (bbb222) @ 2026-01-11
# 🔴 New failures: 1
# 🟢 Resolved: 1
# 📈 page_load_ms: 800ms → 1100ms (+37.5%)`,
    language: "bash",
  },
  {
    icon: RefreshCw,
    title: "Trends Analysis",
    description:
      "Analyze flaky test patterns across multiple runs. Detect worsening, improving, and stable tests. See the worst offenders by fail rate and get actionable recommendations.",
    details: [
      "Worsening / improving / stable detection",
      "Recent vs. overall fail rate comparison",
      "Worst offenders by fail rate",
      "JSON output for CI integration",
    ],
    code: `cerberus trends --branch main
# Total runs analyzed: 50
# Overall fail rate: 12%
# 📈 checkout.spec.ts:42 — 40% fail rate (worsening)`,
    language: "bash",
  },
  {
    icon: Lock,
    title: "Zero-Cost Mock Mode",
    description:
      "Every feature works without any API key. MockProvider uses deterministic local heuristics to classify failures. Full pipeline is testable and demoable in CI with zero external API cost.",
    details: [
      "Deterministic heuristic: retry→flaky, assertion→regression",
      "CERBERUS_MOCK=1 or no API key → auto fallback",
      "All 237 tests run in mock mode",
      "Perfect for demos, CI, and development",
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Section>
        <SectionHeader
          as={1}
          badge="Features"
          title="Everything you need to trust your test suite"
          description="A comprehensive observability layer that sits above your existing test infrastructure."
        />

        <div className="space-y-24 max-w-4xl mx-auto">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="scroll-mt-24"
              id={feature.title.toLowerCase().replace(/\s+/g, "-")}
            >
              <div className="flex items-start gap-5 mb-6">
                <div className="w-12 h-12 rounded-xl bg-purple-600/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <feature.icon className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h2 className="text-2xl font-bold text-white">{feature.title}</h2>
                    {feature.badge && (
                      <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-purple-600/20 text-purple-300 border border-purple-500/20">
                        {feature.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400 leading-relaxed">{feature.description}</p>
                </div>
              </div>

              {feature.details && (
                <div className="ml-17 grid sm:grid-cols-2 gap-3 mb-6">
                  {feature.details.map((detail) => (
                    <div key={detail} className="flex items-start gap-2 text-sm text-gray-400">
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                      {detail}
                    </div>
                  ))}
                </div>
              )}

              {feature.code && (
                <div className="ml-17">
                  <CodeBlock
                    code={feature.code}
                    language={feature.language || "bash"}
                    filename={feature.filename}
                    showLineNumbers
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
