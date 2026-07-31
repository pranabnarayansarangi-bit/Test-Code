/**
 * Approximate title matching for edge discovery.
 *
 * Two notes can mean the same title without being the same string: casing,
 * punctuation, accents, plurals and the occasional typo all defeat a literal
 * matcher. Everything here works on a *canonical key* — the title reduced to
 * folded, singularised word tokens — so those variants collapse onto each other
 * before any edit-distance work is needed. Only genuine misspellings fall
 * through to the (much more expensive) Levenshtein comparison.
 */

/** Word tokens. Used identically for note titles and for prose, so that the
 *  canonical key of a title and of the text mentioning it are comparable. */
const TOKEN_RE = /[\p{L}\p{N}]+/gu;

/** Buckets for the character-histogram prefilter. Collisions only weaken the
 *  bound, never invalidate it, so a small power-of-two table is fine. */
const BAG_BUCKETS = 32;

/** Lowercase and strip combining marks, so "Café" and "cafe" agree. */
export function foldCase(input: string): string {
	return input.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Reduce an English plural to its singular. Deliberately crude — it is applied
 * to both sides of every comparison, so it only has to be *consistent*
 * ("movies" and "movies" both fold to "movy"), not linguistically correct.
 */
export function singularize(word: string): string {
	if (word.length <= 3) return word;
	if (/[^aeiou]ies$/.test(word)) return word.slice(0, -3) + "y";
	if (/(?:ss|sh|ch|x|z)es$/.test(word)) return word.slice(0, -2);
	if (/(?:ss|us|is)$/.test(word)) return word;
	if (/s$/.test(word)) return word.slice(0, -1);
	return word;
}

/** Split text into folded, singularised word tokens. */
export function tokenizeKey(text: string): string[] {
	const out: string[] = [];
	const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) out.push(singularize(foldCase(m[0])));
	return out;
}

/**
 * The comparable form of a title or a phrase: word tokens, folded and
 * singularised, joined by single spaces. "Neural Networks!" and
 * "  neural-network " both yield "neural network".
 */
export function canonicalKey(text: string): string {
	return tokenizeKey(text).join(" ");
}

/** Number of word tokens in a canonical key. */
function keyWordCount(key: string): number {
	return key.length === 0 ? 0 : key.split(" ").length;
}

function charBag(key: string): Int16Array {
	const bag = new Int16Array(BAG_BUCKETS);
	for (let i = 0; i < key.length; i++) bag[key.charCodeAt(i) % BAG_BUCKETS]++;
	return bag;
}

/** One bit per occupied bucket — the cheap half of the prefilter. */
function charSignature(key: string): number {
	let sig = 0;
	for (let i = 0; i < key.length; i++) sig |= 1 << key.charCodeAt(i) % BAG_BUCKETS;
	return sig;
}

function popcount(x: number): number {
	x = x - ((x >>> 1) & 0x55555555);
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	x = (x + (x >>> 4)) & 0x0f0f0f0f;
	return Math.imul(x, 0x01010101) >>> 24;
}

/**
 * Lower bound on edit distance from the two signatures: every bucket present in
 * one string and absent from the other forces at least one distinct edit. Two
 * bitwise ops and a popcount, so it is worth running before the histogram.
 */
function signatureLowerBound(a: number, b: number): number {
	return Math.max(popcount(a & ~b), popcount(b & ~a));
}

/**
 * Lower bound on the edit distance between two strings, from their character
 * histograms. Every edit changes the summed histogram difference by at most 2,
 * so half that sum can never exceed the true distance — which makes this a safe
 * way to reject candidates before paying for the full DP.
 */
function bagLowerBound(a: Int16Array, b: Int16Array): number {
	let sum = 0;
	for (let i = 0; i < BAG_BUCKETS; i++) {
		const d = a[i] - b[i];
		sum += d < 0 ? -d : d;
	}
	return Math.ceil(sum / 2);
}

/**
 * Levenshtein distance, computed only within a diagonal band of width `max`
 * and abandoned as soon as every cell in a row exceeds it. Returns `max + 1`
 * to mean "further apart than we care about".
 */
export function boundedLevenshtein(a: string, b: string, max: number): number {
	if (a === b) return 0;
	if (max < 0) return max + 1;
	if (Math.abs(a.length - b.length) > max) return max + 1;
	// Iterate over the longer string so the band logic has a single shape.
	if (a.length > b.length) {
		const swap = a;
		a = b;
		b = swap;
	}
	const n = a.length;
	const m = b.length;
	if (n === 0) return m <= max ? m : max + 1;

	let prev = new Array<number>(n + 1);
	let curr = new Array<number>(n + 1);
	for (let i = 0; i <= n; i++) prev[i] = i;

	for (let j = 1; j <= m; j++) {
		const from = Math.max(1, j - max);
		const to = Math.min(n, j + max);
		curr[0] = j;
		// Fence the cells just outside the band so neighbours read as infinite.
		if (from > 1) curr[from - 1] = max + 1;
		let rowMin = max + 1;
		for (let i = from; i <= to; i++) {
			const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
			const v = Math.min(prev[i] + 1, curr[i - 1] + 1, prev[i - 1] + cost);
			curr[i] = v;
			if (v < rowMin) rowMin = v;
		}
		if (to < n) curr[to + 1] = max + 1;
		if (rowMin > max) return max + 1;
		const swap = prev;
		prev = curr;
		curr = swap;
	}
	const d = prev[n];
	return d <= max ? d : max + 1;
}

export interface FuzzyMatch<T> {
	value: T;
	/** 1 for a canonical-form match, below 1 for an edit-distance match. */
	similarity: number;
}

export interface FuzzyOptions {
	/** Minimum similarity (0..1) to accept. 1 disables edit-distance matching
	 *  entirely, leaving only case/punctuation/accent/plural folding. */
	threshold: number;
	/** Keys shorter than this are never indexed or looked up — short words are
	 *  a few edits away from far too many other short words. */
	minKeyLength: number;
	/** Absolute ceiling on edit distance, whatever `threshold` would allow on a
	 *  long key. Bounds both the nonsense and the work. */
	maxEdits: number;
}

interface Entry<T> {
	key: string;
	sig: number;
	bag: Int16Array;
	value: T;
}

/**
 * Cap on remembered lookups. A vault scan asks about the same phrases over and
 * over, so the cache does most of the work; when it fills we drop it wholesale
 * rather than track recency, which would cost more than the misses.
 */
const LOOKUP_CACHE_LIMIT = 20000;

/**
 * Canonical-key lookup with an edit-distance fallback.
 *
 * Candidates are narrowed by key length before any distance is computed: for a
 * query of length L and threshold t, only keys in `[L·t, L/t]` can possibly
 * clear the bar, because a match needs `distance ≤ (1-t)·max(L, Lc)`.
 */
export class FuzzyIndex<T> {
	private exact = new Map<string, T>();
	private byLength = new Map<number, Entry<T>[]>();
	private cache = new Map<string, FuzzyMatch<T> | null>();
	/** Word count of the longest indexed key — caps how wide an n-gram the
	 *  caller has to consider when scanning prose. */
	maxWords = 0;
	private count = 0;

	constructor(private opts: FuzzyOptions) {}

	get size(): number {
		return this.count;
	}

	/** Index one title/alias. Returns false when the title is too short to use. */
	add(text: string, value: T): boolean {
		const key = canonicalKey(text);
		if (key.length < this.opts.minKeyLength) return false;

		// First writer wins: callers add in priority order (longest title first).
		if (!this.exact.has(key)) {
			this.exact.set(key, value);
			if (this.opts.threshold < 1) {
				const bucket = this.byLength.get(key.length);
				const entry: Entry<T> = {
					key,
					sig: charSignature(key),
					bag: charBag(key),
					value,
				};
				if (bucket) bucket.push(entry);
				else this.byLength.set(key.length, [entry]);
			}
			this.count++;
			this.cache.clear();
		}
		const words = keyWordCount(key);
		if (words > this.maxWords) this.maxWords = words;
		return true;
	}

	/** Best match for a canonical key, or null when nothing clears the threshold. */
	lookup(key: string): FuzzyMatch<T> | null {
		if (key.length < this.opts.minKeyLength) return null;

		const hit = this.exact.get(key);
		if (hit !== undefined) return { value: hit, similarity: 1 };
		if (this.opts.threshold >= 1) return null;

		const cached = this.cache.get(key);
		if (cached !== undefined) return cached;

		const found = this.search(key);
		if (this.cache.size >= LOOKUP_CACHE_LIMIT) this.cache.clear();
		this.cache.set(key, found);
		return found;
	}

	/**
	 * Largest distance whose similarity still clears `floor`, found by counting
	 * down rather than by inverting `1 - d/maxLen`. Inverting invites rounding
	 * error — `1 - 0.8` is `0.199…96`, which silently loses a match sitting
	 * exactly on the threshold — and counting down reuses the very expression
	 * the caller later compares against, so the two cannot disagree.
	 */
	private admissible(maxLen: number, floorSimilarity: number): number {
		let d = Math.min(this.opts.maxEdits, maxLen);
		while (d > 0 && 1 - d / maxLen < floorSimilarity) d--;
		return d;
	}

	private search(key: string): FuzzyMatch<T> | null {
		const t = this.opts.threshold;
		const sig = charSignature(key);
		const bag = charBag(key);
		// Length alone rules out anything more than maxEdits away; the exact
		// per-bucket allowance below does the rest of the filtering.
		const lo = Math.max(this.opts.minKeyLength, key.length - this.opts.maxEdits);
		const hi = key.length + this.opts.maxEdits;
		let best: FuzzyMatch<T> | null = null;
		let bestKey = "";

		for (let len = lo; len <= hi; len++) {
			const bucket = this.byLength.get(len);
			if (!bucket) continue;
			const maxLen = Math.max(key.length, len);
			const allowed = this.admissible(maxLen, t);
			if (allowed === 0 || Math.abs(key.length - len) > allowed) continue;
			// Once a match is in hand, only a closer one — or a tie that sorts
			// earlier — can displace it, so tighten the bound to what it left.
			const ceiling =
				best === null ? allowed : Math.min(allowed, this.admissible(maxLen, best.similarity));
			if (ceiling === 0) continue;

			for (const entry of bucket) {
				if (signatureLowerBound(sig, entry.sig) > ceiling) continue;
				if (bagLowerBound(bag, entry.bag) > ceiling) continue;
				const d = boundedLevenshtein(key, entry.key, ceiling);
				if (d > ceiling) continue;
				const similarity = 1 - d / maxLen;
				// Ties break on the key itself so scan and apply always agree.
				if (
					best === null ||
					similarity > best.similarity ||
					(similarity === best.similarity && entry.key < bestKey)
				) {
					best = { value: entry.value, similarity };
					bestKey = entry.key;
				}
			}
		}
		return best;
	}
}

export interface Token {
	start: number;
	end: number;
	key: string;
}

/**
 * Split content into word tokens, keeping each token's offset in the original
 * string so a match can be replaced in place. Tokens carry their canonical
 * form, so an n-gram's key is just its tokens joined by spaces — which is
 * exactly how {@link canonicalKey} builds a title's key.
 */
export function tokenizeWithOffsets(content: string): Token[] {
	const tokens: Token[] = [];
	const re = new RegExp(TOKEN_RE.source, TOKEN_RE.flags);
	let m: RegExpExecArray | null;
	while ((m = re.exec(content)) !== null) {
		tokens.push({
			start: m.index,
			end: m.index + m[0].length,
			key: singularize(foldCase(m[0])),
		});
	}
	return tokens;
}
