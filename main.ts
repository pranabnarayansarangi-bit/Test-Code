import { Notice, Plugin, TFile } from "obsidian";
import { DEFAULT_SETTINGS, GraphDeclutterSettings } from "./src/settings";
import { DeclutterEngine, describeReasons, ClutterCandidate } from "./src/declutter";
import { LinkEngine, EdgeSuggestion } from "./src/linker";
import { ReportModal, ReportItem } from "./src/ui/reportModal";
import { GraphDeclutterSettingTab } from "./src/ui/settingsTab";

export default class GraphDeclutterPlugin extends Plugin {
	settings: GraphDeclutterSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addCommand({
			id: "declutter-scan",
			name: "Find clutter & spam nodes (review, then trash)",
			callback: () => this.runDeclutter(),
		});

		this.addCommand({
			id: "find-edges",
			name: "Find missing links (edges) between notes",
			callback: () => this.runFindEdges(),
		});

		this.addRibbonIcon("brush-cleaning", "Graph Declutter: find clutter", () =>
			this.runDeclutter()
		);

		this.addSettingTab(new GraphDeclutterSettingTab(this.app, this));
	}

	private async runDeclutter(): Promise<void> {
		const engine = new DeclutterEngine(this.app, this.settings);
		const notice = new Notice("Graph Declutter: scanning for clutter…", 0);
		let candidates: ClutterCandidate[];
		try {
			candidates = await engine.scan();
		} finally {
			notice.hide();
		}

		const items: ReportItem[] = candidates.map((c) => ({
			title: c.file.path,
			detail: `${describeReasons(c.reasons)} · ${c.words} word(s)`,
			checked: true,
		}));

		new ReportModal(this.app, {
			heading: "Clutter & spam nodes",
			emptyText: "No clutter or spam nodes found. 🎉",
			actionLabel: `Move selected to "${this.settings.trashFolder}"`,
			items,
			onConfirm: async (indices) => {
				const files = indices.map((i) => candidates[i].file).filter(Boolean) as TFile[];
				if (files.length === 0) {
					new Notice("Graph Declutter: nothing selected.");
					return;
				}
				const { moved, errors } = await engine.moveToTrash(files);
				new Notice(
					`Graph Declutter: moved ${moved} note(s) to "${this.settings.trashFolder}".` +
						(errors.length ? ` ${errors.length} failed.` : "")
				);
				if (errors.length) console.error("Graph Declutter move errors:", errors);
			},
		}).open();
	}

	private async runFindEdges(): Promise<void> {
		const engine = new LinkEngine(this.app, this.settings);
		const notice = new Notice("Graph Declutter: scanning for missing links…", 0);
		let suggestions: EdgeSuggestion[];
		try {
			suggestions = await engine.scan();
		} finally {
			notice.hide();
		}

		const items: ReportItem[] = suggestions.map((s) => ({
			title: `${s.file.path}  →  [[${s.target}]]`,
			detail: `line ${s.line}: ${s.context}`,
			// Approximate matches are guesses, so make the user opt into each one
			// rather than trusting a "select all" they may not have read.
			badge: s.fuzzy ? `fuzzy ${Math.round(s.similarity * 100)}%` : undefined,
			checked: !s.fuzzy,
		}));

		const fuzzyCount = suggestions.filter((s) => s.fuzzy).length;

		new ReportModal(this.app, {
			heading: "Missing links (edges)",
			emptyText: "No missing links found.",
			note: fuzzyCount
				? `${fuzzyCount} approximate match(es) start unchecked — review each before inserting.`
				: undefined,
			actionLabel: "Insert selected links",
			items,
			onConfirm: async (indices) => {
				const accepted = indices.map((i) => suggestions[i]).filter(Boolean);
				if (accepted.length === 0) {
					new Notice("Graph Declutter: nothing selected.");
					return;
				}
				const { applied, notes } = await engine.apply(accepted);
				new Notice(`Graph Declutter: added ${applied} link(s) across ${notes} note(s).`);
			},
		}).open();
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
