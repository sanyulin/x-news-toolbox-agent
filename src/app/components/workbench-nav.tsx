"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/inbox", "今日内容"],
  ["/status", "运行状态"],
  ["/settings/connections", "设置"],
] as const;

export function WorkbenchNav() {
  const pathname = usePathname();
  return (
    <nav className="workbench-nav" aria-label="工作台导航">
      {items.map(([href, label]) => (
        <Link aria-current={pathname === href ? "page" : undefined} href={href} key={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
