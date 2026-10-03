"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface TerminalLine {
  text: string;
  delay: number;
  type?: "command" | "output" | "success" | "error" | "warning" | "dim" | "blank";
}

const pipeline: TerminalLine[] = [
  {
    text: "$ cerberus run -i results.json -f playwright-json --run-id 42 --commit a1b2c3 --branch feat/checkout --pr 128",
    delay: 0,
    type: "command",
  },
  { text: "", delay: 400, type: "blank" },
  { text: "📥 Ingesting playwright-json results from 1 file...", delay: 600, type: "output" },
  { text: "   ✅ 24 tests (18 passed, 4 failed, 2 skipped)", delay: 1200, type: "success" },
  { text: "", delay: 1400, type: "blank" },
  { text: "🔍 Classifying failures...", delay: 1600, type: "output" },
  { text: "   ✅ 4 failures: 2 flaky, 1 regression, 1 unknown", delay: 2400, type: "success" },
  { text: "   Provider: claude:claude-sonnet-4-6", delay: 2800, type: "dim" },
  { text: "", delay: 3000, type: "blank" },
  { text: "🚦 Evaluating gate...", delay: 3200, type: "output" },
  { text: "   ❌ Gate: FAILED", delay: 3800, type: "error" },
  { text: "      - 1 regression(s) detected — real bugs found.", delay: 4000, type: "error" },
  { text: "", delay: 4200, type: "blank" },
  { text: "📝 Generating report...", delay: 4400, type: "output" },
  { text: "   ✅ Report posted to PR #128", delay: 5200, type: "success" },
  { text: "", delay: 5400, type: "blank" },
  { text: "══════════════════════════════════════════════════", delay: 5600, type: "dim" },
  { text: "🐕‍🦺 Cerberus: Gate FAILED", delay: 5800, type: "error" },
  { text: "══════════════════════════════════════════════════", delay: 6000, type: "dim" },
];

const lineStyles: Record<string, string> = {
  command: "text-green-400 font-semibold",
  output: "text-gray-300",
  success: "text-green-400",
  error: "text-red-400",
  warning: "text-yellow-400",
  dim: "text-gray-600",
  blank: "",
};

export function TerminalMockup() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [isInView, setIsInView] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout[]>([]);

  // Intersection Observer to start animation when visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isInView) {
          setIsInView(true);
        }
      },
      { threshold: 0.3 },
    );

    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [isInView]);

  // Animate lines when in view
  useEffect(() => {
    if (!isInView) return;

    // Clear any existing timeouts
    timeoutRef.current.forEach(clearTimeout);
    timeoutRef.current = [];

    pipeline.forEach((line, i) => {
      const timeout = setTimeout(() => {
        setVisibleLines(i + 1);
        if (i === pipeline.length - 1) {
          setIsComplete(true);
        }
      }, line.delay);
      timeoutRef.current.push(timeout);
    });

    return () => timeoutRef.current.forEach(clearTimeout);
  }, [isInView]);

  return (
    <div ref={ref} className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0f] overflow-hidden shadow-2xl shadow-purple-600/5">
        {/* Title Bar */}
        <div className="flex items-center gap-2 px-4 py-3 bg-white/[0.03] border-b border-white/[0.06]">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <span className="text-xs text-gray-600 font-mono ml-2">cerberus-ci — ~/my-project</span>
        </div>

        {/* Terminal Content */}
        <div className="p-5 font-mono text-sm leading-6 min-h-[400px]">
          {pipeline.slice(0, visibleLines).map((line, i) => (
            <div key={i} className={cn("whitespace-pre-wrap", lineStyles[line.type || "output"])}>
              {line.text || "\u00A0"}
            </div>
          ))}

          {/* Blinking cursor — single instance */}
          {!isComplete && visibleLines > 0 && visibleLines <= pipeline.length && (
            <span className="inline-block animate-pulse text-purple-400 font-bold">▋</span>
          )}
        </div>
      </div>
    </div>
  );
}
