"use client";

import { useEffect, useRef, useState } from "react";

export function PRCommentMockup() {
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
      { threshold: 0.2 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`w-full max-w-2xl mx-auto transition-all duration-700 ease-out ${
        isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      }`}
    >
      {/* GitHub-style PR comment */}
      <div className="rounded-xl border border-white/[0.08] bg-[#0a0a0f] overflow-hidden">
        {/* Comment header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02]">
          <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-sm">
            🐕‍🦺
          </div>
          <div className="flex-1">
            <span className="text-sm font-semibold text-white">Cerberus CI</span>
            <span className="text-xs text-gray-600 ml-2">commented</span>
          </div>
          <span className="text-xs text-gray-600">just now</span>
        </div>

        {/* Comment body */}
        <div className="p-5 space-y-4">
          {/* Gate status */}
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-600/20 text-red-400 border border-red-500/20">
              FAILED
            </span>
            <span className="text-sm text-gray-400">Quality gate did not pass</span>
          </div>

          {/* Summary */}
          <div className="text-sm text-gray-300 space-y-2">
            <p>
              <span className="text-red-400 font-semibold">1 regression</span> detected in{" "}
              <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-xs text-gray-300 font-mono">
                checkout.spec.ts:42
              </code>{" "}
              — assertion failure with clear expected vs. actual mismatch.
            </p>
            <p>
              <span className="text-yellow-400">2 flaky tests</span> detected (not blocking):{" "}
              <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-xs text-gray-300 font-mono">
                login.spec.ts:18
              </code>
              ,{" "}
              <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-xs text-gray-300 font-mono">
                search.spec.ts:7
              </code>
            </p>
          </div>

          {/* Performance */}
          <div className="text-sm text-gray-400 bg-white/[0.02] rounded-lg p-3 border border-white/[0.04]">
            <span className="text-gray-500 text-xs uppercase tracking-wider font-medium">
              Performance
            </span>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-red-400">↑</span>
              <span>
                <code className="text-gray-300">checkout_page_load_ms</code>: 842ms → 1,140ms{" "}
                <span className="text-red-400 font-medium">(+35.4%)</span>
                <span className="text-gray-600 ml-1">threshold: 20%</span>
              </span>
            </div>
          </div>

          {/* AI Analysis (collapsible) */}
          <details className="group">
            <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-300 transition-colors select-none">
              <span className="group-open:hidden">▶</span>
              <span className="hidden group-open:inline">▼</span> AI Analysis
            </summary>
            <div className="mt-3 text-sm text-gray-400 leading-relaxed pl-4 border-l-2 border-purple-500/20">
              The regression in <code className="text-gray-300">checkout.spec.ts:42</code> appears
              to be a real code change effect — the assertion failure shows a clear expected vs.
              actual mismatch (&quot;expected discount to be 20% but got 0%&quot;), with consistent
              failures across the last 3 runs. The flaky failures in login and search show timeout
              patterns with mixed pass/fail history, characteristic of environment timing issues.
            </div>
          </details>

          {/* Footer */}
          <div className="text-[11px] text-gray-600 pt-2 border-t border-white/[0.04]">
            Classified using: claude:claude-sonnet-4-6
          </div>
        </div>
      </div>
    </div>
  );
}
