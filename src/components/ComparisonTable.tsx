"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, XCircle, Minus } from "lucide-react";

const comparisons = [
  {
    category: "Flaky test detection",
    before: "Manual triage — engineers guess from error messages",
    after: "AI classifies flaky vs. regression with reasoning",
    beforeIcon: "bad",
    afterIcon: "good",
  },
  {
    category: "Performance regressions",
    before: "Invisible until user complaints (2-4 weeks later)",
    after: "Caught at PR time with statistical comparison",
    beforeIcon: "bad",
    afterIcon: "good",
  },
  {
    category: "Gate behavior",
    before: "Depends on who's looking at the CI output",
    after: "100% deterministic — same input, same output",
    beforeIcon: "bad",
    afterIcon: "good",
  },
  {
    category: "API cost per run",
    before: "N/A (no classification happening)",
    after: "<1 API call average (cache + rules handle most)",
    beforeIcon: "neutral",
    afterIcon: "good",
  },
  {
    category: "PR feedback",
    before: "Engineers manually write comments about test results",
    after: "Auto-generated plain-English quality report",
    beforeIcon: "bad",
    afterIcon: "good",
  },
  {
    category: "Historical visibility",
    before: "Test results scattered across CI logs",
    after: "SQLite DB with trends, baselines, and comparisons",
    beforeIcon: "bad",
    afterIcon: "good",
  },
];

function StatusIcon({ type }: { type: string }) {
  if (type === "good") return <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />;
  if (type === "bad") return <XCircle className="w-4 h-4 text-red-400 shrink-0" />;
  return <Minus className="w-4 h-4 text-gray-600 shrink-0" />;
}

export function ComparisonTable() {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full max-w-4xl mx-auto">
      {/* Desktop: table layout */}
      <div className="hidden md:block">
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_1fr] gap-4 mb-4 px-4">
          <div className="text-xs text-gray-600 uppercase tracking-wider font-medium">Category</div>
          <div className="text-xs text-gray-600 uppercase tracking-wider font-medium text-center">
            <span className="text-red-400/60">Without</span> Cerberus
          </div>
          <div className="text-xs text-gray-600 uppercase tracking-wider font-medium text-center">
            <span className="text-green-400/60">With</span> Cerberus
          </div>
        </div>

        {/* Rows */}
        <div className="space-y-2">
          {comparisons.map((row, i) => (
            <div
              key={row.category}
              className={`grid grid-cols-[1fr_1fr_1fr] gap-4 px-4 py-4 rounded-xl bg-white/[0.02] border border-white/[0.04] transition-all duration-500 ${
                isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
              }`}
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="text-sm font-medium text-white flex items-center gap-2">
                {row.category}
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <StatusIcon type={row.beforeIcon} />
                <span>{row.before}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <StatusIcon type={row.afterIcon} />
                <span>{row.after}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-3">
        {comparisons.map((row, i) => (
          <div
            key={row.category}
            className={`rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 transition-all duration-500 ${
              isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: `${i * 80}ms` }}
          >
            <div className="text-sm font-medium text-white mb-3">{row.category}</div>
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-xs text-gray-500">
                <StatusIcon type={row.beforeIcon} />
                <span>{row.before}</span>
              </div>
              <div className="flex items-start gap-2 text-xs text-gray-300">
                <StatusIcon type={row.afterIcon} />
                <span>{row.after}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
