import Link from "next/link";
import {
  Shield,
  Brain,
  Eye,
  GitBranch,
  BarChart3,
  Terminal,
  MessageSquare,
  RefreshCw,
  Lock,
  ArrowRight,
  AlertTriangle,
  Gauge as GaugeIcon,
} from "lucide-react";
import { Section, SectionHeader } from "@/components/Section";
import { FeatureCard } from "@/components/FeatureCard";
import { CodeBlock } from "@/components/CodeBlock";
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { GithubIcon } from "@/components/Icons";
import { TerminalMockup } from "@/components/TerminalMockup";
import { AnimateOnScroll } from "@/components/AnimateOnScroll";
import { AnimatedStat } from "@/components/AnimatedStat";
import { PRCommentMockup } from "@/components/PRCommentMockup";
import { ComparisonTable } from "@/components/ComparisonTable";

const quickStartAction = `- uses: EvertonSt/cerberus-ci@v2.0.0
  with:
    ai-provider: claude
    ai-api-key: \${{ secrets.ANTHROPIC_API_KEY }}
    github-token: \${{ secrets.GITHUB_TOKEN }}
    test-results-path: ./test-results/results.json`;

export default function HomePage() {
  return (
    <>
      {/* ═══ Hero ═══ */}
      <section className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-purple-600/10 rounded-full blur-[120px]" />

        <div className="relative mx-auto max-w-7xl px-6 pt-32 md:pt-40 pb-16">
          <div className="text-center max-w-4xl mx-auto mb-16">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.04] border border-white/[0.08] text-sm text-gray-400 mb-8 animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              AI-powered CI quality gate
            </div>

            {/* Headline */}
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 animate-slide-up">
              <span className="text-white">Nothing gets past</span>
              <br />
              <span className="gradient-text">Cerberus.</span>
            </h1>

            {/* Subtitle */}
            <p
              className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
              Classifies flaky tests vs. real regressions. Catches performance degradation before it
              ships. Posts a plain-English quality report on every pull request.
            </p>

            {/* CTAs */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <Link
                href="/docs"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-500 transition-all glow-purple text-sm"
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="https://github.com/EvertonSt/cerberus-ci"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white font-medium hover:bg-white/[0.1] transition-all text-sm"
              >
                <GithubIcon className="w-4 h-4" />
                View on GitHub
              </Link>
            </div>
          </div>

          {/* Terminal Mockup — the hero visual */}
          <div className="animate-slide-up" style={{ animationDelay: "0.4s" }}>
            <TerminalMockup />
          </div>
        </div>
      </section>

      {/* ═══ Problem Statement ═══ */}
      <Section>
        <SectionHeader
          badge="The Problem"
          title="CI is broken. You just stopped noticing."
          description="Two silent killers erode your team's testing confidence every day."
        />

        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <AnimateOnScroll animation="slide-left">
            <div className="glass-card p-8 h-full">
              <div className="w-12 h-12 rounded-xl bg-red-600/10 border border-red-500/20 flex items-center justify-center mb-5">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">Flaky tests erode trust</h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                A test fails intermittently for reasons unrelated to the code change. Over time,
                engineers start ignoring red CI. Real regressions slip through because nobody trusts
                the signal anymore.
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                Average team: 15-25% flaky tests
              </div>
            </div>
          </AnimateOnScroll>

          <AnimateOnScroll animation="slide-right" delay={100}>
            <div className="glass-card p-8 h-full">
              <div className="w-12 h-12 rounded-xl bg-yellow-600/10 border border-yellow-500/20 flex items-center justify-center mb-5">
                <GaugeIcon className="w-6 h-6 text-yellow-400" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-3">
                Perf regressions are invisible
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed mb-4">
                Functional tests check &quot;does it work,&quot; but almost nobody gates a PR on
                &quot;did this change make the checkout flow 300ms slower.&quot; By the time users
                complain, the regression is weeks old.
              </p>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                Avg detection time: 2-4 weeks
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </Section>

      {/* ═══ Before/After Comparison ═══ */}
      <Section className="bg-white/[0.01]">
        <SectionHeader
          badge="Before vs. After"
          title="Stop guessing. Start knowing."
          description="See what changes when Cerberus guards your CI gate."
        />
        <AnimateOnScroll>
          <ComparisonTable />
        </AnimateOnScroll>
      </Section>

      {/* ═══ Features Grid ═══ */}
      <Section>
        <SectionHeader
          badge="Features"
          title="A full observability layer for your CI"
          description="Everything you need to trust your test suite and ship with confidence."
        />

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {[
            {
              icon: Brain,
              title: "Three-tier classification",
              desc: "Rules → cache → AI. Cheapest check first. Resolves ~40% of failures without any API call.",
              badge: "Core",
            },
            {
              icon: Shield,
              title: "Deterministic gate",
              desc: "AI never makes the pass/fail decision. Gate behavior is 100% reproducible regardless of provider choice.",
            },
            {
              icon: BarChart3,
              title: "Performance regression",
              desc: "Statistical comparison against branch baselines. Flags >20% slowdowns before they ship.",
            },
            {
              icon: Eye,
              title: "Provider-agnostic AI",
              desc: "Claude default, OpenAI-compatible covers Ollama, Groq, OpenRouter, and more. Config change, not code change.",
            },
            {
              icon: MessageSquare,
              title: "PR comments",
              desc: "Plain-English quality reports on every pull request. Deduplicated, updated in-place.",
            },
            {
              icon: Terminal,
              title: "GitHub Action",
              desc: "One line: uses: EvertonSt/cerberus-ci@v2.0.0. Works with any test framework via JUnit XML.",
            },
            {
              icon: GitBranch,
              title: "Run comparison",
              desc: "Diff two runs side-by-side. See new failures, resolved issues, and performance deltas at a glance.",
            },
            {
              icon: RefreshCw,
              title: "Trends analysis",
              desc: "Detect worsening flaky patterns across runs. See which tests need attention before they spiral.",
            },
            {
              icon: Lock,
              title: "Zero-cost mock mode",
              desc: "Full pipeline runs without any API key. Demo, test, and develop without external dependencies.",
            },
          ].map((f, i) => (
            <AnimateOnScroll key={f.title} delay={i * 60}>
              <FeatureCard icon={f.icon} title={f.title} description={f.desc} badge={f.badge} />
            </AnimateOnScroll>
          ))}
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-3xl mx-auto">
          <AnimatedStat value={237} label="Tests passing" />
          <AnimatedStat value={88} suffix="%" label="Code coverage" />
          <AnimatedStat value={11} label="CLI commands" />
          <AnimatedStat value={3} label="AI providers" />
        </div>
      </Section>

      {/* ═══ PR Comment Mockup ═══ */}
      <Section className="bg-white/[0.01]">
        <SectionHeader
          badge="PR Feedback"
          title="Quality reports on every pull request"
          description="Plain-English analysis with flaky/regression classification, performance deltas, and AI reasoning."
        />
        <PRCommentMockup />
      </Section>

      {/* ═══ How It Works ═══ */}
      <Section>
        <SectionHeader
          badge="How It Works"
          title="Architecture that maps to the name"
          description="The three-headed dog guards the gate. Three tiers classify. Zero AI calls at gate time."
        />
        <AnimateOnScroll>
          <ArchitectureDiagram />
        </AnimateOnScroll>
      </Section>

      {/* ═══ Provider Comparison ═══ */}
      <Section className="bg-white/[0.01]">
        <SectionHeader
          badge="Provider-Agnostic"
          title="Switch providers with one config change"
          description="Not vendor-locked. The OpenAI-compatible adapter covers 90% of the market."
        />

        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {[
            {
              emoji: "🟠",
              name: "Claude",
              desc: "Default provider. Native Anthropic SDK.",
              code: "ai:\n  provider: claude\n  model: claude-sonnet-4-6\n  api_key_env: ANTHROPIC_API_KEY",
            },
            {
              emoji: "🟢",
              name: "OpenAI / Any compatible",
              desc: "OpenAI, Groq, Ollama, LM Studio, DeepSeek...",
              code: "ai:\n  provider: openai-compatible\n  base_url: http://localhost:11434/v1\n  model: llama3\n  api_key_env: null",
            },
            {
              emoji: "⚪",
              name: "Mock (Free)",
              desc: "Deterministic heuristic. Zero API cost.",
              code: "ai:\n  provider: mock",
            },
          ].map((p, i) => (
            <AnimateOnScroll key={p.name} delay={i * 100}>
              <div className="glass-card p-6 h-full">
                <div className="text-2xl mb-3">{p.emoji}</div>
                <h3 className="text-sm font-semibold text-white mb-2">{p.name}</h3>
                <p className="text-xs text-gray-500 mb-4">{p.desc}</p>
                <CodeBlock code={p.code} language="yaml" className="text-xs" />
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </Section>

      {/* ═══ Quick Start ═══ */}
      <Section>
        <SectionHeader
          badge="Quick Start"
          title="Up and running in 60 seconds"
          description="Works as a GitHub Action or CLI. Supports Playwright, Jest, Cypress, pytest — anything that outputs JUnit XML."
        />

        <AnimateOnScroll>
          <div className="max-w-3xl mx-auto">
            <CodeBlock
              code={quickStartAction}
              language="yaml"
              filename=".github/workflows/ci.yml"
            />
          </div>
        </AnimateOnScroll>

        <div className="text-center mt-12">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white font-medium hover:bg-white/[0.1] transition-all text-sm"
          >
            Read the full documentation
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </Section>

      {/* ═══ Final CTA ═══ */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-purple-600/10 rounded-full blur-[100px]" />

        <div className="relative mx-auto max-w-7xl px-6 py-32 text-center">
          <h2 className="text-4xl md:text-6xl font-bold tracking-tight text-white mb-6">
            Guard your CI gate.
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10">
            Install Cerberus today. Start trusting your test suite again.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="https://github.com/EvertonSt/cerberus-ci"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-8 py-4 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-all glow-purple"
            >
              <GithubIcon className="w-5 h-5" />
              Star on GitHub
            </Link>
            <Link
              href="/docs"
              className="flex items-center gap-2 px-8 py-4 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white font-semibold hover:bg-white/[0.1] transition-all"
            >
              Read the Docs
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
