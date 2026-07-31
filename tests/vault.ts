import { App, TFile } from "obsidian";
import { DEFAULT_SETTINGS, GraphDeclutterSettings } from "../src/settings";

export interface FakeNote {
	/** Vault-relative path, e.g. "notes/Machine Learning.md". */
	path: string;
	content: string;
	aliases?: string[];
}

export interface FakeVault {
	app: App;
	/** Current content of each note, updated in place by `vault.modify`. */
	contents: Map<string, string>;
	file(path: string): TFile;
}

function makeFile(path: string): TFile {
	const file = Object.create(TFile.prototype) as TFile;
	const name = path.slice(path.lastIndexOf("/") + 1);
	const dot = name.lastIndexOf(".");
	file.path = path;
	file.name = name;
	file.basename = dot > 0 ? name.slice(0, dot) : name;
	file.extension = dot > 0 ? name.slice(dot + 1) : "";
	file.parent = null;
	return file;
}

/** An in-memory vault exposing only the surface the engines actually touch. */
export function makeVault(notes: FakeNote[]): FakeVault {
	const files = new Map<string, TFile>();
	const contents = new Map<string, string>();
	const frontmatter = new Map<string, { aliases?: string[] }>();

	for (const note of notes) {
		files.set(note.path, makeFile(note.path));
		contents.set(note.path, note.content);
		if (note.aliases) frontmatter.set(note.path, { aliases: note.aliases });
	}

	const app = {
		vault: {
			getMarkdownFiles: () => Array.from(files.values()),
			cachedRead: async (f: TFile) => contents.get(f.path) ?? "",
			read: async (f: TFile) => contents.get(f.path) ?? "",
			modify: async (f: TFile, data: string) => {
				contents.set(f.path, data);
			},
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			createFolder: async () => undefined,
		},
		metadataCache: {
			getFileCache: (f: TFile) => ({ frontmatter: frontmatter.get(f.path) }),
			resolvedLinks: {} as Record<string, Record<string, number>>,
		},
		fileManager: {
			renameFile: async () => undefined,
		},
	};

	return {
		app: app as unknown as App,
		contents,
		file: (path: string) => {
			const f = files.get(path);
			if (!f) throw new Error(`no such note in fake vault: ${path}`);
			return f;
		},
	};
}

export function settings(overrides: Partial<GraphDeclutterSettings>): GraphDeclutterSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}
