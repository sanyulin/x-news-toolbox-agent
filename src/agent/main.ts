import { spawn } from "node:child_process";

import { createAppDesk } from "@/server/create-app-desk";
import { horizonRuntimeReady } from "@/server/horizon-worker";
import { getEffectiveRuntimeConfig } from "@/server/runtime-config";
import { createWorkspaceDataStore } from "@/server/workspace-data";

import { classifyAgentError, executeAgentCommand, notificationForAgentResult } from "./cli-command";

function notify(message: string) {
  if (process.platform !== "win32" || process.env.CREATOR_MIND_DISABLE_NOTIFICATIONS === "1") return;
  const script = "$shell=New-Object -ComObject WScript.Shell; $null=$shell.Popup($args[0],10,'X News Toolbox',64)";
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", script, message], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.on("error", () => undefined);
  child.unref();
}

try {
  const config = getEffectiveRuntimeConfig();
  const sources = createWorkspaceDataStore().listSources().filter((source) => source.enabled);
  const result = await executeAgentCommand(process.argv.slice(2), createAppDesk(), new Date(), {
    horizonConfigured: Boolean(
      config.horizon?.enabled &&
      (config.horizon.provider === "ollama" || config.horizon.apiKey),
    ),
    horizonRuntimeReady: horizonRuntimeReady(),
    enabledSourceCount: sources.length,
    readySourceCount: sources.filter((source) => source.lastStatus === "ready").length,
  });
  process.stdout.write(`${JSON.stringify(result.body)}\n`);
  const message = notificationForAgentResult(result);
  if (message) notify(message);
  process.exitCode = result.exitCode;
} catch (error) {
  const failure = classifyAgentError(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: failure.message })}\n`);
  notify(`自动任务失败：${failure.message}`);
  process.exitCode = failure.exitCode;
}
