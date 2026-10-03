"use client";

import { cn } from "@/lib/utils";

interface PipelineNodeProps {
  label: string;
  sublabel?: string;
  icon: string;
  variant?: "default" | "primary" | "success" | "danger" | "ai";
  className?: string;
}

function PipelineNode({
  label,
  sublabel,
  icon,
  variant = "default",
  className,
}: PipelineNodeProps) {
  const styles = {
    default: "border-white/10 bg-white/[0.03] hover:border-white/20",
    primary: "border-purple-500/30 bg-purple-600/10 hover:border-purple-500/50 glow-purple",
    success: "border-green-500/30 bg-green-600/10 hover:border-green-500/50",
    danger: "border-red-500/30 bg-red-600/10 hover:border-red-500/50",
    ai: "border-purple-400/30 bg-gradient-to-br from-purple-600/10 to-blue-600/10 hover:border-purple-400/50",
  };

  return (
    <div
      className={cn(
        "rounded-xl border p-4 transition-all duration-300 text-center",
        styles[variant],
        className,
      )}
    >
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-semibold text-white">{label}</div>
      {sublabel && <div className="text-xs text-gray-500 mt-1">{sublabel}</div>}
    </div>
  );
}

function Arrow({ direction = "down", label }: { direction?: "down" | "right"; label?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center",
        direction === "down" ? "flex-col py-2" : "flex-row px-2",
      )}
    >
      <div className={cn("bg-white/10", direction === "down" ? "w-px h-6" : "h-px w-6")} />
      {label && <span className="text-[10px] text-gray-600 my-1 font-mono">{label}</span>}
      <div className={cn("bg-white/10", direction === "down" ? "w-px h-6" : "h-px w-6")} />
    </div>
  );
}

export function ArchitectureDiagram() {
  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Top: Input */}
      <div className="flex justify-center mb-2">
        <PipelineNode label="Test Suite Output" sublabel="JUnit XML / Playwright JSON" icon="📄" />
      </div>

      <Arrow />

      {/* Ingest */}
      <div className="flex justify-center mb-2">
        <PipelineNode
          label="cerberus ingest"
          sublabel="Parse & store results"
          icon="📥"
          variant="primary"
        />
      </div>

      <Arrow />

      {/* Storage */}
      <div className="flex justify-center mb-2">
        <PipelineNode label="SQLite Database" sublabel="Historical run data" icon="🗄️" />
      </div>

      <Arrow />

      {/* Three-tier classifier */}
      <div className="mb-2">
        <div className="text-center text-xs text-gray-600 mb-3 font-mono uppercase tracking-widest">
          Three-Tier Classification Pipeline
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PipelineNode label="Rules" sublabel="Deterministic, <1ms" icon="📏" variant="success" />
          <PipelineNode label="Cache" sublabel="Signature lookup, <5ms" icon="💾" />
          <PipelineNode label="AI" sublabel="Claude / OpenAI-compatible" icon="🤖" variant="ai" />
        </div>
        <div className="flex justify-center mt-2">
          <div className="flex items-center gap-2 text-[10px] text-gray-600">
            <span className="px-2 py-1 rounded bg-green-500/10 text-green-400">~40% resolved</span>
            <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">~30% resolved</span>
            <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400">
              ~30% resolved
            </span>
          </div>
        </div>
      </div>

      <Arrow />

      {/* Gate */}
      <div className="flex justify-center mb-2">
        <PipelineNode
          label="cerberus gate"
          sublabel="Deterministic, 0/1 exit code"
          icon="🚦"
          variant="danger"
        />
      </div>

      <Arrow />

      {/* Outputs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <PipelineNode label="PR Comment" sublabel="Plain-English report" icon="💬" />
        <PipelineNode label="Annotations" sublabel="::error / ::warning" icon="📌" />
        <PipelineNode label="Exit Code" sublabel="0 = pass, 1 = fail" icon="🔒" />
      </div>
    </div>
  );
}
