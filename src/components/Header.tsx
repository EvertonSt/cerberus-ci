"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { Menu, X, ExternalLink } from "lucide-react";
import { GithubIcon } from "@/components/Icons";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/features", label: "Features" },
  { href: "/docs", label: "Docs" },
  { href: "/architecture", label: "Architecture" },
];

export function Header() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY;

      // Show background after scrolling past threshold
      setScrolled(currentY > 20);

      // Hide on scroll down, show on scroll up (only after scrolling past header height)
      if (currentY > 80) {
        setHidden(currentY > lastScrollY.current && currentY - lastScrollY.current > 5);
      } else {
        setHidden(false);
      }

      lastScrollY.current = currentY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  /*
   * Close the mobile menu on navigation.
   *
   * This used to be an effect calling `setMobileOpen(false)` whenever
   * `pathname` changed. That renders once with the menu still open, then
   * renders again closed - a visible flash on every tap, and a cascading
   * render the React compiler rightly refuses to compile around. React's
   * documented way to adjust state during render is a stored previous value,
   * which applies the change before anything is painted.
   */
  const [lastPathname, setLastPathname] = useState(pathname);
  if (lastPathname !== pathname) {
    setLastPathname(pathname);
    setMobileOpen(false);
  }

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-white/[0.06] bg-[#030712]/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent",
        hidden ? "-translate-y-full" : "translate-y-0",
      )}
    >
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 group" aria-label="Cerberus CI Home">
          <div className="w-8 h-8 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-lg group-hover:bg-purple-600/30 transition-colors">
            🐕‍🦺
          </div>
          <span className="text-lg font-semibold text-white tracking-tight">
            Cerberus<span className="text-purple-400 ml-0.5">CI</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "text-white bg-white/[0.08]"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.04]",
              )}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href="https://github.com/EvertonSt/cerberus-ci"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <GithubIcon className="w-4 h-4" />
            GitHub
          </Link>
          <Link
            href="/docs"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-600 text-white hover:bg-purple-500 transition-colors"
          >
            Get Started
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Mobile Toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={cn(
          "md:hidden border-t border-white/[0.06] bg-[#030712]/95 backdrop-blur-xl overflow-hidden transition-all duration-300",
          mobileOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0 border-t-0",
        )}
        aria-hidden={!mobileOpen}
      >
        <nav className="px-6 py-4 space-y-1" aria-label="Mobile navigation">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "block px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                pathname === href
                  ? "text-white bg-white/[0.08]"
                  : "text-gray-400 hover:text-white hover:bg-white/[0.04]",
              )}
              aria-current={pathname === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <Link
            href="https://github.com/EvertonSt/cerberus-ci"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-white/[0.04] transition-colors"
          >
            <GithubIcon className="w-4 h-4" />
            GitHub
          </Link>
        </nav>
      </div>
    </header>
  );
}
