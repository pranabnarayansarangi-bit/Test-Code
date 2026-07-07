import { App, TFile, normalizePath } from "obsidian";
import { GraphDeclutterSettings } from "./settings";
import {
	stripFrontmatter,
	countWords,
	countUrls,
} from "./textUtils";

export type ClutterReason = "empty" | "stub" | "orphan" | "spam" | "link-farm";

export interface ClutterCandidate {
	file: TFile;
	reasons: ClutterReason[];
	words: number;
}

const REASON_LABEL: Record<ClutterReason, string> = {
	empty: "empty",
	stub: "stub",
	orphan: "orphan",
	spam: "spam",
	"link-farm": "link farm",
};

export function describeReasons(reasons: ClutterReason[]): string {
	return reasons.map((r) => REASON_LABEL[r]).join(", ");
}

/** Detects clutter/spam notes and moves flagged notes to a trash folder. */
export class DeclutterEngine {
	constructor(
		private app: App,
		private settings: GraphDeclutterSettings
	) {}

	private compileSpamPatterns(): RegExp[] {
		const out: RegExp[] = [];
		for (const raw of this.settings.spamPatterns) {
			const pattern = raw.trim();
			if (!pattern) continue;
			try {
				out.push(new RegExp(pattern, "i"));
			} catch {
				// Skip invalid user-supplied regexes rather than aborting the scan.
			}
		}
		return out;
	}

	private isProtected(file: TFile): boolean {
		// Skip the trash folder and any ignored folders.
		const trash = normalizePath(this.settings.trashFolder);
		if (file.path === trash || file.path.startsWith(trash + "/")) return true;
		for (const folder of this.settings.ignoreFolders) {
			const prefix = folder.trim().replace(/\/+$/, "");
			if (prefix && file.path.startsWith(prefix + "/")) return true;
		}

		// Skip notes carrying a protection tag.
		const protectTags = this.settings.protectTags
			.map((t) => t.replace(/^#/, "").trim().toLowerCase())
			.filter(Boolean);
		if (protectTags.length === 0) return false;

		const cache = this.app.metadataCache.getFileCache(file);
		const noteTags = new Set<string>();
		for (const t of cache?.tags ?? []) {
			noteTags.add(t.tag.replace(/^#/, "").toLowerCase());
		}
		const fmTags = cache?.frontmatter?.tags;
		if (Array.isArray(fmTags)) {
			for (const t of fmTags) noteTags.add(String(t).replace(/^#/, "").toLowerCase());
		} else if (typeof fmTags === "string") {
			for (const t of fmTags.split(/[,\s]+/)) {
				if (t) noteTags.add(t.replace(/^#/, "").toLowerCase());
			}
		}
		return protectTags.some((t) => noteTags.has(t));
	}

	/** Build the set of note paths that have at least one incoming resolved link. */
	private computeLinkedTargets(): Set<string> {
		const targets = new Set<string>();
		const resolved = this.app.metadataCache.resolvedLinks;
		for (const source of Object.keys(resolved)) {
			for (const dest of Object.keys(resolved[source])) {
				targets.add(dest);
			}
		}
		return targets;
	}

	async scan(): Promise<ClutterCandidate[]> {
		const spamPatterns = this.compileSpamPatterns();
		const incoming = this.settings.flagOrphans ? this.computeLinkedTargets() : null;
		const resolved = this.app.metadataCache.resolvedLinks;
		const candidates: ClutterCandidate[] = [];

		for (const file of this.app.vault.getMarkdownFiles()) {
			if (this.isProtected(file)) continue;

			const raw = await this.app.vault.cachedRead(file);
			const body = stripFrontmatter(raw).trim();
			const words = countWords(body);
			const reasons: ClutterReason[] = [];

			if (this.settings.flagEmpty && body.length === 0) {
				reasons.push("empty");
			} else if (this.settings.flagStubs && words < this.settings.stubMinWords) {
				reasons.push("stub");
			}

			if (this.settings.flagOrphans && incoming) {
				const hasIncoming = incoming.has(file.path);
				const outgoing = resolved[file.path];
				const hasOutgoing = outgoing && Object.keys(outgoing).length > 0;
				if (!hasIncoming && !hasOutgoing) reasons.push("orphan");
			}

			if (this.settings.flagSpam && spamPatterns.some((re) => re.test(body))) {
				reasons.push("spam");
			}

			if (this.settings.flagLinkFarms) {
				const urls = countUrls(body);
				if (urls >= this.settings.linkFarmMinUrls && urls >= words) {
					reasons.push("link-farm");
				}
			}

			if (reasons.length > 0) {
				candidates.push({ file, reasons, words });
			}
		}

		candidates.sort((a, b) => a.file.path.localeCompare(b.file.path));
		return candidates;
	}

	/** Ensure the trash folder exists, creating parent folders as needed. */
	private async ensureTrashFolder(): Promise<string> {
		const folder = normalizePath(this.settings.trashFolder);
		if (!this.app.vault.getAbstractFileByPath(folder)) {
			await this.app.vault.createFolder(folder).catch(() => {
				/* already created by a concurrent op */
			});
		}
		return folder;
	}

	/**
	 * Move the given files into the trash folder. Uses fileManager.renameFile so
	 * that inbound links are updated rather than broken. Returns how many moved.
	 */
	async moveToTrash(files: TFile[]): Promise<{ moved: number; errors: string[] }> {
		if (files.length === 0) return { moved: 0, errors: [] };
		const folder = await this.ensureTrashFolder();
		const errors: string[] = [];
		let moved = 0;

		for (const file of files) {
			let target = normalizePath(`${folder}/${file.name}`);
			// Avoid clobbering an existing note of the same name in trash.
			if (this.app.vault.getAbstractFileByPath(target)) {
				target = normalizePath(`${folder}/${file.basename}-${Date.now()}.${file.extension}`);
			}
			try {
				await this.app.fileManager.renameFile(file, target);
				moved++;
			} catch (e) {
				errors.push(`${file.path}: ${e instanceof Error ? e.message : String(e)}`);
			}
		}
		return { moved, errors };
	}
}
