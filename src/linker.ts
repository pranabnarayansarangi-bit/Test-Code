import { App, TFile, normalizePath } from "obsidian";
import {
	GraphDeclutterSettings,
	FUZZY_MAX_EDITS,
	FUZZY_MIN_TITLE_LENGTH,
	clampFuzzyThreshold,
} from "./settings";
import {
	escapeRegExp,
	computeProtectedRanges,
	overlapsAny,
	Range,
} from "./textUtils";
import { FuzzyIndex, tokenizeWithOffsets } from "./fuzzy";

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
	/** True when the text differs from the title and was matched approximately. */
	fuzzy: boolean;
	/** 1 for a literal hit, below 1 for an edit-distance hit. */
	similarity: number;
}

type PlannedEdit = EdgeSuggestion & { start: number; end: number; replacement: string };

/**
 * Characters that cannot appear inside a wikilink's display text. A fuzzy span
 * covers whatever sits between two words, so unlike a literal title it can pick
 * these up and produce a broken link.
 */
const UNSAFE_IN_LINK = /[[\]|\r\n]/;

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
		// The name tie-breaks keep the order total, so a scan and the apply that
		// follows it always plan the same edits.
		targets.sort(
			(a, b) =>
				b.match.length - a.match.length ||
				a.target.localeCompare(b.target) ||
				a.match.localeCompare(b.match)
		);
		return targets;
	}

	/**
	 * Index the same targets for approximate matching, or null when fuzzy
	 * matching is off. Targets are added longest-first, so when several titles
	 * share a canonical form the most specific one wins.
	 */
	private buildFuzzyIndex(targets: LinkTarget[]): FuzzyIndex<LinkTarget> | null {
		if (!this.settings.linkFuzzy) return null;
		const index = new FuzzyIndex<LinkTarget>({
			threshold: clampFuzzyThreshold(this.settings.linkFuzzyThreshold),
			minKeyLength: Math.max(FUZZY_MIN_TITLE_LENGTH, this.settings.linkMinTitleLength),
			maxEdits: FUZZY_MAX_EDITS,
		});
		for (const t of targets) index.add(t.match, t);
		return index.size > 0 ? index : null;
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
		const fuzzy = this.buildFuzzyIndex(targets);
		const suggestions: EdgeSuggestion[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			const content = await this.app.vault.cachedRead(file);
			const protectedRanges = computeProtectedRanges(content);
			const perNote = this.planForNote(file, content, targets, protectedRanges, fuzzy);
			for (const s of perNote) suggestions.push(s);
		}
		return suggestions;
	}

	/**
	 * Compute the ordered set of edits for a single note (used by scan + apply).
	 * Literal matches are planned first and claim their ranges, so an approximate
	 * match can only ever fill a gap the exact pass left behind.
	 */
	private planForNote(
		file: TFile,
		content: string,
		targets: LinkTarget[],
		protectedRanges: Range[],
		fuzzy: FuzzyIndex<LinkTarget> | null
	): PlannedEdit[] {
		const claimed: Range[] = [...protectedRanges];
		const edits: PlannedEdit[] = [];
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

				edits.push(
					this.makeEdit(file, content, t.target, start, end, false, 1)
				);
				claimed.push({ start, end });
				linkedTargets.add(t.target);
				break; // only the first mention per target
			}
		}

		if (fuzzy) {
			const budget = cap > 0 ? cap - edits.length : Infinity;
			for (const e of this.planFuzzyForNote(
				file,
				content,
				fuzzy,
				claimed,
				linkedTargets,
				budget
			)) {
				edits.push(e);
			}
		}

		edits.sort((a, b) => a.start - b.start);
		return edits;
	}

	/**
	 * Walk the note's words looking for phrases that *read* like a note title
	 * without matching one literally. Candidate n-grams are tried longest-first
	 * at each position so "Machine Learning" beats "Learning", and an accepted
	 * span consumes its words so the next candidate starts after it.
	 *
	 * `claimed` and `linkedTargets` are updated in place, exactly as the literal
	 * pass does, so both passes share one view of what the note already spends.
	 */
	private planFuzzyForNote(
		file: TFile,
		content: string,
		index: FuzzyIndex<LinkTarget>,
		claimed: Range[],
		linkedTargets: Set<string>,
		budget: number
	): PlannedEdit[] {
		const edits: PlannedEdit[] = [];
		if (budget <= 0 || index.maxWords === 0) return edits;

		const tokens = tokenizeWithOffsets(content);
		let i = 0;

		while (i < tokens.length) {
			if (edits.length >= budget) break;
			let consumed = 1;
			const widest = Math.min(index.maxWords, tokens.length - i);

			for (let len = widest; len >= 1; len--) {
				const start = tokens[i].start;
				const end = tokens[i + len - 1].end;
				// A span is raw prose between two words, so it can hold anything.
				if (UNSAFE_IN_LINK.test(content.slice(start, end))) continue;
				if (overlapsAny(start, end, claimed)) continue;

				let key = tokens[i].key;
				for (let k = 1; k < len; k++) key += " " + tokens[i + k].key;

				const match = index.lookup(key);
				if (match === null) continue;
				const t = match.value;
				if (t.file.path === file.path) continue; // never self-link
				if (t.target === file.basename) continue; // alias of self
				if (linkedTargets.has(t.target)) continue;

				edits.push(
					this.makeEdit(file, content, t.target, start, end, true, match.similarity)
				);
				claimed.push({ start, end });
				linkedTargets.add(t.target);
				consumed = len;
				break;
			}
			i += consumed;
		}
		return edits;
	}

	private makeEdit(
		file: TFile,
		content: string,
		target: string,
		start: number,
		end: number,
		fuzzy: boolean,
		similarity: number
	): PlannedEdit {
		const matchedText = content.slice(start, end);
		return {
			file,
			target,
			matchedText,
			line: content.slice(0, start).split(/\r?\n/).length,
			context: this.contextAround(content, start, end),
			fuzzy,
			similarity,
			start,
			end,
			replacement:
				matchedText === target ? `[[${target}]]` : `[[${target}|${matchedText}]]`,
		};
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
		const fuzzy = this.buildFuzzyIndex(targets);
		let applied = 0;
		let notes = 0;

		for (const [path, group] of byPath) {
			const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
			if (!(file instanceof TFile)) continue;

			const content = await this.app.vault.read(file);
			const protectedRanges = computeProtectedRanges(content);
			const plan = this.planForNote(file, content, targets, protectedRanges, fuzzy);
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
