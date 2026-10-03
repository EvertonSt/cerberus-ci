import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { GithubIcon } from "@/components/Icons";

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const footerLinks: Record<string, FooterLink[]> = {
  Product: [
    { label: "Features", href: "/features" },
    { label: "Documentation", href: "/docs" },
    { label: "Architecture", href: "/architecture" },
  ],
  Resources: [
    { label: "GitHub", href: "https://github.com/EvertonSt/cerberus-ci", external: true },
    { label: "npm Package", href: "https://www.npmjs.com/package/cerberus-ci", external: true },
    {
      label: "GitHub Action",
      href: "https://github.com/marketplace/actions/cerberus-ci-action",
      external: true,
    },
  ],
  Community: [
    {
      label: "Report an Issue",
      href: "https://github.com/EvertonSt/cerberus-ci/issues",
      external: true,
    },
    {
      label: "MIT License",
      href: "https://github.com/EvertonSt/cerberus-ci/blob/main/LICENSE",
      external: true,
    },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#030712]">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg">
                🐕‍🦺
              </div>
              <span className="text-lg font-semibold text-white tracking-tight">
                Cerberus<span className="text-purple-400 ml-0.5">CI</span>
              </span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed max-w-xs">
              AI-powered test-health and performance-regression gate for CI pipelines. Nothing gets
              past it unnoticed.
            </p>
          </div>

          {/* Link Groups */}
          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-sm font-semibold text-white mb-4">{category}</h3>
              <ul className="space-y-3">
                {links.map(({ label, href, external }) => (
                  <li key={label}>
                    <Link
                      href={href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-sm text-gray-500 hover:text-gray-300 transition-colors inline-flex items-center gap-1.5"
                    >
                      {label}
                      {external && <ExternalLink className="w-3 h-3" />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="mt-16 pt-8 border-t border-white/[0.06] flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-xs text-gray-600">
            © {new Date().getFullYear()} Cerberus CI. Built by{" "}
            <Link
              href="https://github.com/EvertonSt"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              EvertonSt
            </Link>
            .
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/EvertonSt/cerberus-ci"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-300 transition-colors"
              aria-label="GitHub"
            >
              <GithubIcon className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
