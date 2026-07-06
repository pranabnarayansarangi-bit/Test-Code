/** Escape a string so it can be embedded literally inside a RegExp. */
export function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Remove a leading YAML frontmatter block (--- ... ---) and return the body.
 * Returns the original string when no frontmatter is present.
 */
export function stripFrontmatter(content: string): string {
	const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	return match ? content.slice(match[0].length) : content;
}

/** Count words in a piece of text, ignoring markdown/link punctuation noise. */
export function countWords(text: string): number {
	const cleaned = text
		.replace(/```[\s\S]*?```/g, " ") // fenced code blocks
		.replace(/`[^`]*`/g, " ") // inline code
		.replace(/[#>*_\-\[\]()!|]/g, " "); // common markdown punctuation
	const words = cleaned.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu);
	return words ? words.length : 0;
}

/** Count URLs (http/https) in a piece of text. */
export function countUrls(text: string): number {
	const matches = text.match(/https?:\/\/\S+/gi);
	return matches ? matches.length : 0;
}

export interface Range {
	start: number;
	end: number;
}

/**
 * Compute character ranges in `content` that must NOT be touched when inserting
 * new links: fenced code, inline code, existing wiki/markdown links, and bare URLs.
 */
export function computeProtectedRanges(content: string): Range[] {
	const ranges: Range[] = [];
	const patterns: RegExp[] = [
		/```[\s\S]*?```/g, // fenced code blocks
		/`[^`]*`/g, // inline code
		/\[\[[^\]]*?\]\]/g, // existing wikilinks
		/!?\[[^\]]*?\]\([^)]*?\)/g, // markdown links / embeds
		/https?:\/\/\S+/gi, // bare URLs
	];
	for (const re of patterns) {
		let m: RegExpExecArray | null;
		while ((m = re.exec(content)) !== null) {
			ranges.push({ start: m.index, end: m.index + m[0].length });
			if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width
		}
	}
	return ranges.sort((a, b) => a.start - b.start);
}

/** True when [start, end) overlaps any of the given ranges. */
export function overlapsAny(start: number, end: number, ranges: Range[]): boolean {
	for (const r of ranges) {
		if (start < r.end && end > r.start) return true;
	}
	return false;
}
