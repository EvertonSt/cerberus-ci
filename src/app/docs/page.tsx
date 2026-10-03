"use client";

import { useState } from "react";
import { Terminal, Settings, Play, FileCode, CheckCircle2 } from "lucide-react";
import { CodeBlock } from "@/components/CodeBlock";
import { cn } from "@/lib/utils";

const sidebarSections = [
  { id: "quick-start", label: "Quick Start", icon: Play },
  { id: "github-action", label: "GitHub Action", icon: Settings },
  { id: "cli-reference", label: "CLI Reference", icon: Terminal },
  { id: "config-reference", label: "Config Reference", icon: FileCode },
  { id: "supported-formats", label: "Supported Formats", icon: FileCode },
];

const commands = [
  {
    name: "cerberus init",
    description: "Generate cerberus.config.yml with sensible defaults",
    usage: "cerberus init [--force]",
    options: ["--force: Overwrite existing config file"],
  },
  {
    name: "cerberus ingest",
    description: "Ingest test results from JUnit XML or Playwright JSON",
    usage:
      "cerberus ingest -i <paths> -f <format> --run-id <id> --commit <sha> --branch <branch> [--pr <number>]",
    options: [
      "-i, --input <paths>: Path(s) to test result file(s), comma-separated",
      "-f, --format <format>: junit | playwright-json",
      "--run-id <id>: CI run identifier",
      "--commit <sha>: Git commit SHA",
      "--branch <name>: Git branch name",
      "--pr <number>: Pull request number",
    ],
  },
  {
    name: "cerberus classify",
    description: "Classify failed tests as flaky or regression",
    usage: "cerberus classify --run-id <id>",
    options: ["--run-id <id>: CI run identifier"],
  },
  {
    name: "cerberus gate",
    description: "Determine if the CI gate passes or fails",
    usage: "cerberus gate --run-id <id> [--annotations]",
    options: ["--run-id <id>: CI run identifier", "--annotations: Emit GitHub Actions annotations"],
  },
  {
    name: "cerberus report",
    description: "Generate quality report and post as PR comment",
    usage: "cerberus report --run-id <id> --pr <number> --repo <owner/repo>",
    options: [
      "--run-id <id>: CI run identifier",
      "--pr <number>: Pull request number",
      "--repo <owner/repo>: GitHub repository",
    ],
  },
  {
    name: "cerberus run",
    description: "Run the full pipeline: ingest → classify → gate → report",
    usage: "cerberus run -i <path> -f <format> --run-id <id> --commit <sha> --branch <branch>",
    options: [
      "-i, --input <path>: Path to test result file",
      "-f, --format <format>: junit | playwright-json",
      "--pr <number>: Pull request number",
      "--repo <owner/repo>: GitHub repository",
      "--no-report: Skip report generation",
      "--annotations: Emit GitHub Actions annotations",
      "--json: Output results as JSON",
    ],
  },
  {
    name: "cerberus compare",
    description: "Compare two CI runs side-by-side",
    usage: "cerberus compare --run-id <id> [--other-run-id <id>]",
    options: [
      "--run-id <id>: Run to compare (the 'after' run)",
      "--other-run-id <id>: Run to compare against (auto-selects previous if omitted)",
      "--json: Output as JSON",
    ],
  },
  {
    name: "cerberus trends",
    description: "Analyze flaky test trends across runs",
    usage: "cerberus trends [--branch <name>] [-n <depth>]",
    options: [
      "--branch <name>: Branch to analyze (default: main)",
      "-n, --depth <count>: Number of runs to analyze (default: 50)",
      "--json: Output as JSON",
    ],
  },
  {
    name: "cerberus history",
    description: "Show pass/fail history for a specific test",
    usage: 'cerberus history --test "<name>" [--branch <name>]',
    options: [
      "--test <name>: Full test name",
      "--branch <name>: Branch to check (default: main)",
      "-n, --depth <count>: Number of runs (default: 20)",
    ],
  },
  {
    name: "cerberus status",
    description: "Show classification status for a run",
    usage: "cerberus status --run-id <id>",
    options: ["--run-id <id>: CI run identifier"],
  },
  {
    name: "cerberus baseline",
    description: "Manage performance baselines from known-good runs",
    usage: "cerberus baseline <set|list|clear>",
    options: [
      "set --run-id <id> [--label <text>]: Mark a run as baseline",
      "list: List all baselines",
      "clear [--run-id <id>]: Remove baseline(s)",
    ],
  },
];

const configSections = [
  {
    title: "AI Provider",
    code: `ai:
  provider: claude              # claude | openai-compatible | mock
  model: claude-sonnet-4-6      # provider-specific model
  base_url: null                # required for openai-compatible
  api_key_env: ANTHROPIC_API_KEY # env var holding the API key`,
  },
  {
    title: "Classifier",
    code: `classifier:
  consecutive_failures_threshold: 3  # auto-regression after N fails
  history_depth: 5                    # recent runs to check
  cache_ttl_days: 30                  # cache duration`,
  },
  {
    title: "Performance",
    code: `perf:
  baseline_branch: main     # branch to compare against
  baseline_runs: 10         # rolling median window
  threshold_pct: 20         # regression threshold %
  thresholds: {}            # per-metric overrides
  exclude: []               # metrics to ignore`,
  },
  {
    title: "Gate",
    code: `gate:
  fail_on_regression: true
  fail_on_unknown: false
  fail_on_perf_regression: true
  max_new_flaky_tests: 3`,
  },
  {
    title: "Storage",
    code: `storage:
  db_path: .cerberus/data.db`,
  },
];

function Sidebar({
  activeSection,
  onNavigate,
}: {
  activeSection: string;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="hidden lg:block w-56 shrink-0">
      <div className="sticky top-24 space-y-1">
        {sidebarSections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              activeSection === id
                ? "text-white bg-white/[0.08]"
                : "text-gray-500 hover:text-gray-300 hover:bg-white/[0.04]",
            )}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("quick-start");

  const scrollTo = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
      {/*
       * The page title. This page had none at all - it opened straight into
       * "Quick Start" as an <h2> - so a screen-reader user arriving by link had
       * no level-one heading identifying where they had landed. The end-to-end
       * journey is what surfaced it.
       */}
      <div className="mb-16 text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-white tracking-tight mb-4">
          Documentation
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Install it, wire it into a pipeline, and read what it decides.
        </p>
      </div>

      <div className="flex gap-12">
        <Sidebar activeSection={activeSection} onNavigate={scrollTo} />

        <div className="flex-1 min-w-0 space-y-20">
          {/* Quick Start */}
          <div id="quick-start" className="scroll-mt-24">
            <h2 className="text-3xl font-bold text-white mb-4">Quick Start</h2>
            <p className="text-gray-400 mb-8">
              Get Cerberus running in your CI pipeline in under a minute.
            </p>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">1. Add the GitHub Action</h3>
                <CodeBlock
                  code={`- uses: EvertonSt/cerberus-ci-action@v1
  with:
    ai-provider: claude
    ai-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    github-token: \${{ secrets.GITHUB_TOKEN }}
    test-results-path: ./test-results/results.json`}
                  language="yaml"
                  filename=".github/workflows/ci.yml"
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  2. Run your tests with JSON output
                </h3>
                <CodeBlock
                  code={`# Playwright
npx playwright test --reporter=json > test-results.json

# Jest
npx jest --json --outputFile=test-results.json

# Vitest
npx vitest run --reporter=json --outputFile=test-results.json`}
                  language="bash"
                  filename="Run your tests"
                />
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-3">
                  3. Cerberus runs automatically
                </h3>
                <p className="text-sm text-gray-400 mb-4">
                  On every PR, Cerberus will ingest your test results, classify failures, check for
                  performance regressions, and post a quality report as a PR comment.
                </p>
              </div>
            </div>
          </div>

          {/* GitHub Action */}
          <div id="github-action" className="scroll-mt-24">
            <h2 className="text-3xl font-bold text-white mb-4">GitHub Action</h2>
            <p className="text-gray-400 mb-8">
              Install Cerberus as a GitHub Action. Works with any test framework.
            </p>

            <div className="space-y-6">
              <CodeBlock
                code={`- uses: EvertonSt/cerberus-ci-action@v1
  with:
    # Required
    test-results-path: ./test-results/results.json

    # AI Provider (default: claude)
    ai-provider: claude
    ai-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    ai-base-url: ""  # only for openai-compatible

    # GitHub
    github-token: \${{ secrets.GITHUB_TOKEN }}

    # Optional
    config-path: cerberus.config.yml
    format: playwright-json  # or junit
    skip-report: "false"
    annotations: "true"  # inline PR feedback`}
                language="yaml"
                filename="workflow.yml"
              />

              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-white mb-3">Outputs</h3>
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <code className="text-purple-400">gate-result</code>
                    <p className="text-gray-500 mt-1">pass or fail</p>
                  </div>
                  <div>
                    <code className="text-purple-400">flaky-count</code>
                    <p className="text-gray-500 mt-1">Number of flaky tests</p>
                  </div>
                  <div>
                    <code className="text-purple-400">regression-count</code>
                    <p className="text-gray-500 mt-1">Number of regressions</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CLI Reference */}
          <div id="cli-reference" className="scroll-mt-24">
            <h2 className="text-3xl font-bold text-white mb-4">CLI Reference</h2>
            <p className="text-gray-400 mb-8">
              <code className="px-2 py-1 rounded bg-white/[0.06] text-sm">
                npm install -g cerberus-ci
              </code>{" "}
              — all 11 commands documented below.
            </p>

            <div className="space-y-8">
              {commands.map((cmd) => (
                <div key={cmd.name} className="glass-card p-6">
                  <h3 className="text-lg font-semibold text-white font-mono mb-2">{cmd.name}</h3>
                  <p className="text-sm text-gray-400 mb-4">{cmd.description}</p>

                  <div className="mb-4">
                    <div className="text-xs text-gray-600 mb-1 uppercase tracking-wider">Usage</div>
                    <code className="text-sm text-gray-300 bg-black/30 px-3 py-2 rounded-lg block overflow-x-auto">
                      {cmd.usage}
                    </code>
                  </div>

                  <div>
                    <div className="text-xs text-gray-600 mb-2 uppercase tracking-wider">
                      Options
                    </div>
                    <div className="space-y-1.5">
                      {cmd.options.map((opt) => (
                        <div key={opt} className="flex items-start gap-2 text-sm text-gray-400">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0 mt-0.5" />
                          <code className="text-gray-300">{opt.split(":")[0]}:</code>
                          <span>{opt.split(":").slice(1).join(":")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Config Reference */}
          <div id="config-reference" className="scroll-mt-24">
            <h2 className="text-3xl font-bold text-white mb-4">Config Reference</h2>
            <p className="text-gray-400 mb-8">
              Cerberus uses{" "}
              <code className="px-2 py-0.5 rounded bg-white/[0.06] text-sm">
                cerberus.config.yml
              </code>{" "}
              for configuration. Generate a default config with{" "}
              <code className="px-2 py-0.5 rounded bg-white/[0.06] text-sm">cerberus init</code>.
            </p>

            <div className="space-y-6">
              {configSections.map((section) => (
                <div key={section.title} className="glass-card p-6">
                  <h3 className="text-sm font-semibold text-white mb-4">{section.title}</h3>
                  <CodeBlock code={section.code} language="yaml" showLineNumbers />
                </div>
              ))}
            </div>
          </div>

          {/* Supported Formats */}
          <div id="supported-formats" className="scroll-mt-24">
            <h2 className="text-3xl font-bold text-white mb-4">Supported Formats</h2>
            <p className="text-gray-400 mb-8">
              Cerberus parses test results from any framework that outputs JUnit XML or Playwright
              JSON.
            </p>

            <div className="grid sm:grid-cols-2 gap-6">
              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-white mb-3">Playwright JSON</h3>
                <code className="text-xs text-gray-400 block mb-3">
                  npx playwright test --reporter=json
                </code>
                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Pass / fail / skip / timeout
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Retry count (deduplication)
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Duration per test
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Error messages & stack
                    traces
                  </div>
                </div>
              </div>

              <div className="glass-card p-6">
                <h3 className="text-sm font-semibold text-white mb-3">JUnit XML</h3>
                <code className="text-xs text-gray-400 block mb-3">
                  Works with Jest, Cypress, pytest, vitest, and more
                </code>
                <div className="space-y-2 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Standard JUnit XML format
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Test suites & test cases
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Failure messages
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" /> Time attributes
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
