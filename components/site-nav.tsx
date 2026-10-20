"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const links = [
  { href: "/", label: "Publish" },
  { href: "/assets", label: "Assets" },
  { href: "/s3", label: "S3" }
];

const commands = [
  { title: "List", note: "Search the catalog.", command: "pnpm imgctl list --post blog/my-post" },
  {
    title: "Snippet",
    note: "New usage record from an asset ID.",
    command: 'pnpm imgctl snippet 12 --post blog/reuse --alt "Alt text"'
  },
  { title: "Import", note: "Backfill from S3.", command: "pnpm imgctl import-s3 --prefix legacy/posts" }
];

export function SiteNav() {
  const pathname = usePathname();
  const [cliOpen, setCliOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setCliOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!cliOpen) return;

    function onPointerDown(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setCliOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCliOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cliOpen]);

  return (
    <header className="site-nav" ref={headerRef}>
      <div className="site-nav-inner">
        <Link className="site-nav-brand" href="/">
          MDX Image Publisher
        </Link>
        <nav aria-label="Primary" className="site-nav-links">
          {links.map((link) => {
            const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);

            return (
              <Link aria-current={isActive ? "page" : undefined} className="site-nav-link" href={link.href} key={link.href}>
                {link.label}
              </Link>
            );
          })}
          <button
            aria-controls="cli-reference"
            aria-expanded={cliOpen}
            className="site-nav-link site-nav-button"
            onClick={() => setCliOpen((open) => !open)}
            type="button"
          >
            CLI
          </button>
        </nav>
      </div>

      {cliOpen ? (
        <div className="cli-dropdown" id="cli-reference">
          <div className="cli-list">
            {commands.map((item) => (
              <div className="cli-item" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.note}</p>
                <code>{item.command}</code>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </header>
  );
}
