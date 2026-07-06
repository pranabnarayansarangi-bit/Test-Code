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
};
