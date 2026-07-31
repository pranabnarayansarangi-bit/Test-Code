export interface GraphDeclutterSettings {
	/** Folder that flagged clutter/spam notes are moved into (never deleted). */
	trashFolder: string;

	// --- Clutter detection ---
	/** Flag notes whose body is empty (only frontmatter / whitespace). */
	flagEmpty: boolean;
	/** Flag notes whose body has fewer than `stubMinWords` words. */
	flagStubs: boolean;
	stubMinWords: number;
	/** Flag notes with no incoming and no outgoing resolved links. */
	flagOrphans: boolean;

	// --- Spam detection ---
	/** Flag notes matching any of the user-supplied spam regexes. */
	flagSpam: boolean;
	/** One regex per line, applied (case-insensitive) to each note's body. */
	spamPatterns: string[];
	/** Flag notes that are almost entirely external links. */
	flagLinkFarms: boolean;
	/** A note is a "link farm" when it has >= this many URLs and fewer words than URLs. */
	linkFarmMinUrls: number;

	// --- Protection ---
	/** Notes carrying any of these tags (with or without leading #) are never flagged. */
	protectTags: string[];
	/** Glob-ish folder prefixes to skip entirely (e.g. "Templates/"). */
	ignoreFolders: string[];

	// --- Edge discovery ---
	/** Only consider note titles/aliases at least this long when auto-linking. */
	linkMinTitleLength: number;
	/** Require a whole-word match before inserting a link. */
	linkWholeWord: boolean;
	/** Case-sensitive title matching. */
	linkCaseSensitive: boolean;
	/** Max new links to add to a single note per run (0 = unlimited). */
	linkMaxPerNote: number;
	/** Also match a note's frontmatter aliases, not just its title. */
	linkUseAliases: boolean;

	// --- Fuzzy edge discovery ---
	/**
	 * After the literal pass, also match near-misses: differences in casing,
	 * punctuation, accents and plurals, plus outright typos.
	 */
	linkFuzzy: boolean;
	/**
	 * How close a near-miss has to be, from 0.5 to 1. At 1 only the
	 * casing/punctuation/accent/plural variants match; lower values start
	 * admitting misspellings.
	 */
	linkFuzzyThreshold: number;
}

/** Bounds for `linkFuzzyThreshold`; much below 0.7 a match means almost nothing. */
export const FUZZY_THRESHOLD_MIN = 0.7;
export const FUZZY_THRESHOLD_MAX = 1;

/**
 * Hard ceiling on how many edits separate a mention from a title, whatever the
 * threshold would otherwise allow on a long one. Past a few characters a "near
 * miss" is a different phrase rather than a misspelling, and the cap is also
 * what stops a large vault's scan from degenerating.
 */
export const FUZZY_MAX_EDITS = 3;

/**
 * Fuzzy matching never applies to titles shorter than this, whatever
 * `linkMinTitleLength` says — short words sit within one edit of far too many
 * unrelated short words.
 */
export const FUZZY_MIN_TITLE_LENGTH = 5;

export function clampFuzzyThreshold(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_SETTINGS.linkFuzzyThreshold;
	return Math.min(FUZZY_THRESHOLD_MAX, Math.max(FUZZY_THRESHOLD_MIN, value));
}

export const DEFAULT_SETTINGS: GraphDeclutterSettings = {
	trashFolder: "_trash",

	flagEmpty: true,
	flagStubs: true,
	stubMinWords: 5,
	flagOrphans: false,

	flagSpam: true,
	spamPatterns: [
		"\\b(viagra|casino|crypto\\s*giveaway|free\\s*money)\\b",
		"(https?:\\/\\/\\S+\\s*){5,}",
	],
	flagLinkFarms: true,
	linkFarmMinUrls: 5,

	protectTags: ["keep"],
	ignoreFolders: ["Templates/", ".obsidian/"],

	linkMinTitleLength: 4,
	linkWholeWord: true,
	linkCaseSensitive: false,
	linkMaxPerNote: 20,
	linkUseAliases: true,

	// Off by default: approximate matches need a human eye, so opt in.
	linkFuzzy: false,
	linkFuzzyThreshold: 0.85,
};
