"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", label: "Publish" },
  { href: "/assets", label: "Assets" }
];

export function PageTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="page-tabs">
      {tabs.map((tab) => {
        const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);

        return (
          <Link aria-current={isActive ? "page" : undefined} className="page-tab" data-active={isActive} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

