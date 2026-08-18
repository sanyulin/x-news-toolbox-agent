import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { build } from "esbuild";

await mkdir("dist/agent", { recursive: true });
await build({
  absWorkingDir: process.cwd(),
  entryPoints: [join(process.cwd(), "src", "agent", "main.ts")],
  outfile: join(process.cwd(), "dist", "agent", "cli.mjs"),
  bundle: true,
  packages: "external",
  platform: "node",
  format: "esm",
  target: "node22",
  tsconfig: join(process.cwd(), "tsconfig.json"),
  banner: { js: "#!/usr/bin/env node" },
});
