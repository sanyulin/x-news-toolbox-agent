"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/radar", "信息扫描"],
  ["/sources", "信息来源"],
  ["/style", "风格档案"],
  ["/drafts", "内容草稿"],
  ["/results", "结果记录"],
  ["/settings/connections", "接口设置"],
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
