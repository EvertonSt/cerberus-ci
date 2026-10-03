"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  filename?: string;
  showLineNumbers?: boolean;
  className?: string;
}

// Simple syntax highlighting (no external deps needed)
function highlightCode(code: string, language: string): string {
  let highlighted = code
    // YAML keys
    .replace(/^(\s*[\w-]+):/gm, '<span class="keyword">$1</span>:')
    // Strings
    .replace(/(["'])(.*?)\1/g, '<span class="string">$1$2$1</span>')
    // Comments
    .replace(/(#[^\n]*)/g, '<span class="comment">$1</span>')
    // Numbers
    .replace(/\b(\d+)\b/g, '<span class="variable">$1</span>')
    // Booleans
    .replace(/\b(true|false|null)\b/g, '<span class="type">$1</span>');

  if (language === "bash" || language === "shell") {
    highlighted = code
      .replace(/(#.*$)/gm, '<span class="comment">$1</span>')
      .replace(/\b(npm|npx|cerberus|git|cd|echo|curl)\b/g, '<span class="function">$1</span>')
      .replace(
        /(install|run|init|ingest|classify|gate|report|status|history|trends|compare|baseline|set|list|clear)/g,
        '<span class="keyword">$1</span>',
      )
      .replace(/(["'])(.*?)\1/g, '<span class="string">$1$2$1</span>')
      .replace(/(-[\w-]+)/g, '<span class="variable">$1</span>')
      .replace(/\$([\w_]+)/g, '<span class="type">$$$1</span>');
  }

  if (language === "yaml") {
    highlighted = code
      .replace(/(#[^\n]*)/g, '<span class="comment">$1</span>')
      .replace(/^(\s*[\w-]+):/gm, '<span class="keyword">$1</span>:')
      .replace(/:\s+(['"])(.*?)\1/g, ': <span class="string">$1$2$1</span>')
      .replace(/:\s+(true|false|null)\b/g, ': <span class="type">$1</span>')
      .replace(/:\s+(\d+)\b/g, ': <span class="variable">$1</span>');
  }

  if (language === "typescript" || language === "ts") {
    highlighted = code
      .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
      .replace(
        /\b(import|from|export|const|let|async|await|function|return|if|else|new|interface|type)\b/g,
        '<span class="keyword">$1</span>',
      )
      .replace(/(["'`])(.*?)\1/g, '<span class="string">$1$2$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="variable">$1</span>')
      .replace(
        /\b(string|number|boolean|Promise|Array|void|null)\b/g,
        '<span class="type">$1</span>',
      );
  }

  return highlighted;
}

export function CodeBlock({
  code,
  language = "bash",
  filename,
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lines = code.split("\n");
  const highlighted = highlightCode(code, language);

  return (
    <div className={cn("relative group", className)}>
      {/* Header */}
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 bg-[#0d1117] border border-b-0 border-[#21262d] rounded-t-xl">
          <span className="text-xs text-gray-500 font-mono">{filename}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">
              {language}
            </span>
          </div>
        </div>
      )}

      {/* Code */}
      <div className={cn("code-block relative", filename ? "rounded-t-none border-t-0" : "")}>
        <pre className="overflow-x-auto">
          {showLineNumbers ? (
            <table>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className="pr-4 text-right text-gray-600 select-none text-xs w-8">
                      {i + 1}
                    </td>
                    <td
                      dangerouslySetInnerHTML={{
                        __html: highlightCode(line, language),
                      }}
                    />
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          )}
        </pre>

        {/* Copy Button */}
        <button
          onClick={() => {
            void handleCopy();
          }}
          className="absolute top-3 right-3 p-2 rounded-lg bg-white/[0.06] border border-white/[0.08] text-gray-500 hover:text-white hover:bg-white/[0.1] transition-all opacity-0 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
