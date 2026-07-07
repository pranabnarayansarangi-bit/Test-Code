import { App, TFile, normalizePath } from "obsidian";
import { GraphDeclutterSettings } from "./settings";
import {
	escapeRegExp,
	computeProtectedRanges,
	overlapsAny,
	Range,
} from "./textUtils";

/** A note title/alias that can be linked to, plus its canonical target. */
interface LinkTarget {
	/** The text that must appear in prose to trigger a link. */
	match: string;
	/** The canonical note basename to link to. */
	target: string;
	file: TFile;
}

/** A concrete insertion the user can accept: turn `match` into a wikilink. */
export interface EdgeSuggestion {
	file: TFile;
	target: string;
	matchedText: string;
	line: number;
	context: string;
}

/** Discovers missing links (edges) between notes and inserts them on demand. */
export class LinkEngine {
	constructor(
		private app: App,
		private settings: GraphDeclutterSettings
	) {}

	private buildTargets(): LinkTarget[] {
		const targets: LinkTarget[] = [];
		const minLen = this.settings.linkMinTitleLength;
		for (const file of this.app.vault.getMarkdownFiles()) {
			if (file.basename.length >= minLen) {
				targets.push({ match: file.basename, target: file.basename, file });
			}
			if (this.settings.linkUseAliases) {
				const aliases = this.app.metadataCache.getFileCache(file)?.frontmatter?.aliases;
				const list = Array.isArray(aliases)
					? aliases
					: typeof aliases === "string"
						? [aliases]
						: [];
				for (const alias of list) {
					const a = String(alias).trim();
					if (a.length >= minLen) targets.push({ match: a, target: file.basename, file });
				}
			}
		}
		// Prefer longer matches first so "Machine Learning" wins over "Learning".
		targets.sort((a, b) => b.match.length - a.match.length);
		return targets;
	}

	private buildMatcher(match: string): RegExp {
		const flags = this.settings.linkCaseSensitive ? "g" : "gi";
		const escaped = escapeRegExp(match);
		// Use lookarounds so surrounding punctuation is preserved and we require a
		// word boundary that also works for unicode letters.
		const body = this.settings.linkWholeWord
			? `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`
			: escaped;
		return new RegExp(body, flags + "u");
	}

	/**
	 * Scan every note for the first unlinked mention of another note's title/alias
	 * and return the suggested insertions (does not modify anything).
	 */
	async scan(): Promise<EdgeSuggestion[]> {
		const targets = this.buildTargets();
		const suggestions: EdgeSuggestion[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			const protectedRanges = computeProtectedRanges(content);
			const perNote = this.planForNote(file, content, targets, protectedRanges);
			for (const s of perNote) suggestions.push(s);
		}
		return suggestions;
	}

	/** Compute the ordered set of edits for a single note (used by scan + apply). */
	private planForNote(
		file: TFile,
		content: string,
		targets: LinkTarget[],
		protectedRanges: Range[]
	): (EdgeSuggestion & { start: number; end: number; replacement: string })[] {
		const claimed: Range[] = [...protectedRanges];
		const edits: (EdgeSuggestion & { start: number; end: number; replacement: string })[] = [];
		const linkedTargets = new Set<string>(); // one edge per (note, target) pair
		const cap = this.settings.linkMaxPerNote;

		for (const t of targets) {
			if (t.file.path === file.path) continue; // never self-link
			if (t.target === file.basename) continue; // alias of self
			if (linkedTargets.has(t.target)) continue;
			if (cap > 0 && edits.length >= cap) break;

			const re = this.buildMatcher(t.match);
			let m: RegExpExecArray | null;
			while ((m = re.exec(content)) !== null) {
				const start = m.index;
				const end = start + m[0].length;
				if (overlapsAny(start, end, claimed)) continue;

				const replacement =
					m[0] === t.target ? `[[${t.target}]]` : `[[${t.target}|${m[0]}]]`;
				const line = content.slice(0, start).split(/\r?\n/).length;
				edits.push({
					file,
					target: t.target,
					matchedText: m[0],
					line,
					context: this.contextAround(content, start, end),
					start,
					end,
					replacement,
				});
				claimed.push({ start, end });
				linkedTargets.add(t.target);
				break; // only the first mention per target
			}
		}
		edits.sort((a, b) => a.start - b.start);
		return edits;
	}

	private contextAround(content: string, start: number, end: number): string {
		const lineStart = content.lastIndexOf("\n", start - 1) + 1;
		let lineEnd = content.indexOf("\n", end);
		if (lineEnd === -1) lineEnd = content.length;
		const before = content.slice(lineStart, start);
		const matched = content.slice(start, end);
		const after = content.slice(end, lineEnd);
		const clip = (s: string, n: number, fromEnd = false) =>
			s.length <= n ? s : fromEnd ? "…" + s.slice(s.length - n) : s.slice(0, n) + "…";
		return `${clip(before, 40, true)}**${matched}**${clip(after, 40)}`.trim();
	}

	/**
	 * Apply the given suggestions. Suggestions are grouped by note; within each
	 * note the plan is recomputed against current content so offsets stay valid,
	 * and only the accepted (file, target) pairs are inserted.
	 */
	async apply(accepted: EdgeSuggestion[]): Promise<{ applied: number; notes: number }> {
		const byPath = new Map<string, EdgeSuggestion[]>();
		for (const s of accepted) {
			const list = byPath.get(s.file.path) ?? [];
			list.push(s);
			byPath.set(s.file.path, list);
		}

		const targets = this.buildTargets();
		let applied = 0;
		let notes = 0;

		for (const [path, group] of byPath) {
			const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
			if (!(file instanceof TFile)) continue;

			const content = await this.app.vault.read(file);
			const protectedRanges = computeProtectedRanges(content);
			const plan = this.planForNote(file, content, targets, protectedRanges);
			const wanted = new Set(group.map((s) => s.target));
			const edits = plan.filter((e) => wanted.has(e.target));
			if (edits.length === 0) continue;

			// Apply from the end so earlier offsets remain valid.
			edits.sort((a, b) => b.start - a.start);
			let next = content;
			for (const e of edits) {
				next = next.slice(0, e.start) + e.replacement + next.slice(e.end);
				applied++;
			}
			await this.app.vault.modify(file, next);
			notes++;
		}
		return { applied, notes };
	}
}
