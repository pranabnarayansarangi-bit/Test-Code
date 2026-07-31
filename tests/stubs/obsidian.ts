/**
 * Just enough of the Obsidian API for the engines to run under Node.
 * `scripts/test.mjs` aliases the "obsidian" import to this module; the real
 * type definitions are still what `tsc` checks against.
 */

export class TFolder {
	path = "";
}

export class TFile {
	path = "";
	name = "";
	basename = "";
	extension = "md";
	parent: TFolder | null = null;
}

export function normalizePath(path: string): string {
	const cleaned = path.replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
	return cleaned === "" ? "/" : cleaned;
}
