import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { WorkbenchNav } from "@/app/components/workbench-nav";
import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { getPublicRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

import "./globals.css";

export const metadata: Metadata = {
  title: "X News Toolbox｜Agent 操作台",
  description: "输入真实来源并运行创作者 Mind Agent。",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const dashboard = await createAppDesk().inspect({ view: "dashboard" });
  const config = getPublicRuntimeConfig();
  const mind = dashboard.systemStatus.mind;
  const mindConnected = mind.state === "connected";
  const horizonReady = config.horizon.enabled && config.horizon.apiKeyConfigured && horizonRuntimeReady();
  const sources = createWorkspaceDataStore().listSources();
  return (
    <html lang="zh-CN">
      <body>
        <main className="workbench-shell">
          <aside className="workbench-sidebar">
            <Link className="brand" href="/radar" aria-label="X News Toolbox 操作台">
              <Image alt="" height={30} priority src="/x-news-toolbox-logo.png" width={30} />
              <strong>X News Toolbox</strong>
            </Link>
            <WorkbenchNav />
          </aside>
          <section className="workbench-main">
            <header className="workspace-header">
              <div className="connection-strip" aria-label="连接状态">
                <Status href="/settings/connections" ready={mindConnected} label="Mind" value={mindConnected ? mind.mindName : "未连接"} />
                <Status href="/settings/connections" ready={horizonReady} label="Horizon" value={horizonReady ? "已就绪" : "未配置"} />
                <Status href="/sources" ready={sources.some((source) => source.enabled)} label="来源" value={`${sources.filter((source) => source.enabled).length} 个启用`} />
              </div>
            </header>
            <div className="workspace-content">{children}</div>
          </section>
        </main>
      </body>
    </html>
  );
}

function Status({ href, ready, label, value }: { href: string; ready: boolean; label: string; value: string }) {
  return (
    <Link className={ready ? "connection-item connection-item-ready" : "connection-item"} href={href}>
      <i aria-hidden="true" />
      <b>{label}</b>
      <span>{value}</span>
    </Link>
  );
}
