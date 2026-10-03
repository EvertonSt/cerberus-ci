"use client";

import { useState } from "react";
import {
  Brain,
  Database,
  Shield,
  BarChart3,
  Eye,
  GitBranch,
  Zap,
  Lock,
  CheckCircle2,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/Section";
import { CodeBlock } from "@/components/CodeBlock";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { cn } from "@/lib/utils";

const tabs = [
  { id: "pipeline", label: "Classification Pipeline", icon: Brain },
  { id: "schema", label: "Database Schema", icon: Database },
  { id: "gate", label: "Gate Logic", icon: Shield },
  { id: "perf", label: "Performance Detection", icon: BarChart3 },
  { id: "providers", label: "AI Providers", icon: Eye },
];

export default function ArchitecturePage() {
  const [activeTab, setActiveTab] = useState("pipeline");

  return (
    <Section>
      <SectionHeader
        as={1}
        badge="Architecture"
        title="Design decisions that matter"
        description="Cerberus is built on a core philosophy: deterministic core, AI-assisted reasoning at the edges."
      />

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 justify-center mb-12">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
              activeTab === id
                ? "text-white bg-purple-600/20 border border-purple-500/30"
                : "text-gray-500 bg-white/[0.03] border border-white/[0.06] hover:text-gray-300 hover:bg-white/[0.05]",
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="max-w-4xl mx-auto">
        {/* Pipeline */}
        {activeTab === "pipeline" && (
          <div className="animate-fade-in space-y-8">
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-white mb-4">
                Three-Tier Classification Pipeline
              </h3>
              <p className="text-gray-400 mb-6">
                Named after the three-headed dog that guards the underworld. Three tiers, each
                progressively more expensive, each resolving failures the cheaper tiers
                couldn&apos;t.
              </p>

              <ArchitectureDiagram />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-green-600/10 border border-green-500/20 flex items-center justify-center">
                    <span className="text-green-400 text-sm font-bold">1</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white">Rule-Based Pre-filter</h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Cost: zero • Latency: &lt;1ms • Resolves: ~40%
                </p>
                <ul className="space-y-1.5 text-xs text-gray-400">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-green-400" /> Retry pass → flaky (0.9)
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-green-400" /> 3+ consecutive fails →
                    regression
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-green-400" /> Navigation timeout → flaky
                    (0.8)
                  </li>
                </ul>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                    <span className="text-blue-400 text-sm font-bold">2</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white">Verdict Cache</h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Cost: zero • Latency: &lt;5ms • Resolves: ~30%
                </p>
                <ul className="space-y-1.5 text-xs text-gray-400">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-blue-400" /> SHA-256 error signature
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-blue-400" /> 30-day TTL
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-blue-400" /> Same shape = same verdict
                  </li>
                </ul>
              </div>

              <div className="glass-card p-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-600/10 border border-purple-500/20 flex items-center justify-center">
                    <span className="text-purple-400 text-sm font-bold">3</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white">AI Classification</h4>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  Cost: 1 API call • Latency: 1-5s • Resolves: ~30%
                </p>
                <ul className="space-y-1.5 text-xs text-gray-400">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-purple-400" /> Only for new error shapes
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-purple-400" /> System prompt with signals
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-purple-400" /> Validated JSON output
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Schema */}
        {activeTab === "schema" && (
          <div className="animate-fade-in space-y-6">
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-white mb-4">SQLite Schema</h3>
              <p className="text-gray-400 mb-6">
                Local-first, zero infrastructure. SQLite via sql.js (pure JavaScript, no native
                build). Database lives in{" "}
                <code className="px-2 py-0.5 rounded bg-white/[0.06] text-sm">
                  .cerberus/data.db
                </code>{" "}
                and is gitignored.
              </p>

              <CodeBlock
                code={`runs (1) ──────< (N) test_results
runs (1) ──────< (N) perf_metrics
runs (1) ──────< (1) baseline_runs
runs (1) ──────── (1) config_snapshots
test_results (1) <── (N) classifications`}
                language="text"
                filename="Entity Relationships"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              {[
                {
                  name: "runs",
                  desc: "CI run metadata — commit SHA, branch, PR number",
                  fields: "ci_run_id, commit_sha, branch, triggered_at, pr_number",
                },
                {
                  name: "test_results",
                  desc: "Individual test outcomes with retry count",
                  fields: "test_name, file_path, status, duration_ms, error_message, retry_count",
                },
                {
                  name: "classifications",
                  desc: "Verdicts with provider audit trail",
                  fields: "verdict, confidence, reasoning, classified_by, ai_provider",
                },
                {
                  name: "perf_metrics",
                  desc: "Performance metrics per run",
                  fields: "metric_name, value_ms, page_or_endpoint",
                },
                {
                  name: "baseline_runs",
                  desc: "Manually-set performance baselines",
                  fields: "run_id, label, created_at",
                },
                {
                  name: "config_snapshots",
                  desc: "Config snapshot per run for auditability",
                  fields: "config_json",
                },
              ].map((table) => (
                <div key={table.name} className="glass-card p-5">
                  <h4 className="text-sm font-semibold text-white font-mono mb-2">{table.name}</h4>
                  <p className="text-xs text-gray-500 mb-3">{table.desc}</p>
                  <code className="text-[11px] text-gray-600 block">{table.fields}</code>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gate */}
        {activeTab === "gate" && (
          <div className="animate-fade-in space-y-6">
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-white mb-4">Deterministic Gate Logic</h3>
              <p className="text-gray-400 mb-6">
                The gate NEVER calls an AI provider. It reads stored verdicts and applies
                deterministic rules. This separation is critical: gate behavior can never vary based
                on provider choice, latency, or availability.
              </p>

              <CodeBlock
                code={`gateResult.passed = (
  (!config.gate.fail_on_regression || regressionCount === 0) &&
  (!config.gate.fail_on_unknown || unknownCount === 0) &&
  (!config.gate.fail_on_perf_regression || perfRegressionCount === 0) &&
  (flakyCount <= config.gate.max_new_flaky_tests)
)`}
                language="typescript"
                filename="gate/index.ts"
                showLineNumbers
              />
            </div>

            <div className="glass-card p-8">
              <h4 className="text-lg font-semibold text-white mb-4">Why this separation matters</h4>
              <div className="space-y-4 text-sm text-gray-400">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Lock className="w-3 h-3 text-red-400" />
                  </div>
                  <div>
                    <strong className="text-white">Provider availability:</strong> If the gate
                    called AI, an API outage would change gate behavior.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-3 h-3 text-red-400" />
                  </div>
                  <div>
                    <strong className="text-white">Provider latency:</strong> A timeout could
                    produce a different result than a successful call.
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-600/10 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <GitBranch className="w-3 h-3 text-red-400" />
                  </div>
                  <div>
                    <strong className="text-white">Provider choice:</strong> Claude and OpenAI might
                    disagree on the same failure.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Performance */}
        {activeTab === "perf" && (
          <div className="animate-fade-in space-y-6">
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-white mb-4">
                Performance Regression Detection
              </h3>
              <p className="text-gray-400 mb-6">
                Statistical comparison using rolling median (robust to outliers). Baseline is
                computed from the target branch&apos;s history, not the PR branch (which typically
                has 1-3 runs).
              </p>

              <CodeBlock
                code={`delta_pct = ((current_value - baseline_median) / baseline_median) * 100
regression = delta_pct > threshold_pct  // default: 20%`}
                language="text"
                filename="Regression Formula"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="glass-card p-6">
                <h4 className="text-sm font-semibold text-white mb-3">Baseline Priority</h4>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" /> Manual
                    baselines: trust even 1 run
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />{" "}
                    Auto-detected: need 3+ runs for statistics
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" /> Cold start:
                    warn, don&apos;t fail
                  </li>
                </ul>
              </div>

              <div className="glass-card p-6">
                <h4 className="text-sm font-semibold text-white mb-3">Configuration</h4>
                <CodeBlock
                  code={`perf:
  baseline_branch: main
  baseline_runs: 10
  threshold_pct: 20
  thresholds:
    api_response_ms: 50  # per-metric
  exclude:
    - noisy_metric       # ignore this`}
                  language="yaml"
                  className="text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* Providers */}
        {activeTab === "providers" && (
          <div className="animate-fade-in space-y-6">
            <div className="glass-card p-8">
              <h3 className="text-xl font-bold text-white mb-4">AI Provider Abstraction</h3>
              <p className="text-gray-400 mb-6">
                Rather than writing N vendor-specific adapters, ship exactly three implementations
                of the same interface. The OpenAI-compatible adapter covers 90% of the market.
              </p>

              <CodeBlock
                code={`interface AIProvider {
  readonly id: string;
  classify(input: ClassificationInput): Promise<ClassificationResult>;
  summarize(input: SummaryInput): Promise<string>;
}`}
                language="typescript"
                filename="src/ai/provider.ts"
                showLineNumbers
              />
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="glass-card p-6">
                <div className="text-2xl mb-3">🟠</div>
                <h4 className="text-sm font-semibold text-white mb-2">ClaudeProvider</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Native Anthropic SDK. First-class default.
                </p>
                <code className="text-[11px] text-gray-600">@anthropic-ai/sdk</code>
              </div>

              <div className="glass-card p-6">
                <div className="text-2xl mb-3">🟢</div>
                <h4 className="text-sm font-semibold text-white mb-2">OpenAICompatibleProvider</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Raw fetch, chat/completions shape. Covers the market.
                </p>
                <div className="space-y-1 text-[11px] text-gray-600">
                  <div>OpenAI • OpenRouter • Groq</div>
                  <div>Together AI • DeepSeek</div>
                  <div>Ollama • LM Studio</div>
                </div>
              </div>

              <div className="glass-card p-6">
                <div className="text-2xl mb-3">⚪</div>
                <h4 className="text-sm font-semibold text-white mb-2">MockProvider</h4>
                <p className="text-xs text-gray-500 mb-3">
                  Deterministic heuristic. Zero API cost.
                </p>
                <code className="text-[11px] text-gray-600">Built-in, always available</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}
