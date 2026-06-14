import { watch } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "bun";

const ROOT = import.meta.dir;
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "dist");

const args = new Set(Bun.argv.slice(2));
const isWatch = args.has("--watch");
const skipDts = args.has("--no-dts");
const minify = args.has("--minify");

const ENTRYPOINTS = [join(SRC, "index.ts"), join(SRC, "client.ts")];

const EXTERNAL = [
  "better-auth",
  "better-auth/*",
  "@better-auth/core",
  "@better-auth/core/*",
  "@better-fetch/fetch",
  "nanostores",
  "zod",
  "node:*",
];

async function buildOnce() {
  const start = performance.now();

  await rm(OUT, { recursive: true, force: true });

  const result = await Bun.build({
    entrypoints: ENTRYPOINTS,
    outdir: OUT,
    target: "node",
    format: "esm",
    splitting: false,
    sourcemap: "linked",
    minify,
    external: EXTERNAL,
    naming: "[name].js",
  });

  for (const log of result.logs) {
    if (log.level === "error") console.error(log);
    else console.warn(log);
  }
  if (!result.success) throw new Error("bun build failed");

  if (!skipDts) {
    const tsc = spawn({
      cmd: ["bunx", "tsc", "-p", "tsconfig.build.json"],
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await tsc.exited;
    if (code !== 0) throw new Error(`tsc exited with code ${code}`);
  }

  console.log(
    `✓ built in ${(performance.now() - start).toFixed(0)}ms → ${OUT}`,
  );
}

if (isWatch) {
  await buildOnce().catch(console.error);
  console.log(`👀 watching ${SRC}`);
  let pending: ReturnType<typeof setTimeout> | null = null;
  watch(SRC, { recursive: true }, () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      buildOnce().catch(console.error);
    }, 80);
  });
} else {
  await buildOnce();
}
