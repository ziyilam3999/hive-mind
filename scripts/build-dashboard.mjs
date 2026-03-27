#!/usr/bin/env node
/**
 * Bundles src/dashboard/dashboard-entry.ts into a browser-ready IIFE.
 *
 * Output: dist/dashboard/dashboard-bundle.js
 * This file is read at runtime by server.ts and inlined into the HTML <script>.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = join(__dirname, "..");

await build({
  entryPoints: [join(root, "src/dashboard/dashboard-entry.ts")],
  bundle: true,
  format: "iife",
  target: "es2020",
  outfile: join(root, "dist/dashboard/dashboard-bundle.js"),
  // No minification — keeps the output readable for debugging.
  minify: false,
  // The entry assigns to globalThis, so we don't need a global name.
  logLevel: "info",
});
