"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  ["/radar", "信息扫描"],
  ["/sources", "信息来源"],
  ["/style", "写作风格"],
  ["/drafts", "内容草稿"],
  ["/results", "运行结果"],
  ["/settings/connections", "连接设置"],
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
