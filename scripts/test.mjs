/**
 * Bundles each tests/*.test.ts with esbuild (aliasing the Obsidian API to a
 * local stub) and runs it under Node. Keeps the repo free of a test-runner
 * dependency — esbuild is already here for the plugin build.
 */
import esbuild from "esbuild";
import fs from "fs";
import os from "os";
import path from "path";
import process from "process";
import { pathToFileURL } from "url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const testDir = path.join(root, "tests");

const entryPoints = fs
	.readdirSync(testDir)
	.filter((f) => f.endsWith(".test.ts"))
	.sort()
	.map((f) => path.join(testDir, f));

if (entryPoints.length === 0) {
	console.error("no test files found in tests/");
	process.exit(1);
}

const outdir = fs.mkdtempSync(path.join(os.tmpdir(), "graph-declutter-tests-"));

await esbuild.build({
	entryPoints,
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node16",
	outdir,
	alias: { obsidian: path.join(testDir, "stubs", "obsidian.ts") },
	logLevel: "warning",
});

let failed = 0;
for (const entry of entryPoints) {
	const name = path.basename(entry, ".ts");
	console.log(`\n${name}`);
	const bundled = path.join(outdir, `${path.basename(entry, ".ts")}.js`);
	const mod = await import(pathToFileURL(bundled).href);
	failed += await mod.default();
}

fs.rmSync(outdir, { recursive: true, force: true });

console.log(failed === 0 ? "\nall tests passed" : `\n${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
