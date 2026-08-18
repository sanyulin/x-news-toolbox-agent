import { createAppDesk } from "@/server/create-app-desk";

import { classifyAgentError, executeAgentCommand } from "./cli-command";

try {
  const result = await executeAgentCommand(process.argv.slice(2), createAppDesk());
  process.stdout.write(`${JSON.stringify(result.body)}\n`);
  process.exitCode = result.exitCode;
} catch (error) {
  const failure = classifyAgentError(error);
  process.stderr.write(`${JSON.stringify({ ok: false, error: failure.message })}\n`);
  process.exitCode = failure.exitCode;
}
