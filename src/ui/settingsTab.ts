import { App, PluginSettingTab, Setting } from "obsidian";
import type GraphDeclutterPlugin from "../../main";

export class GraphDeclutterSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: GraphDeclutterPlugin) {
		super(app, plugin);
	}

	private textList(value: string[]): string {
		return value.join("\n");
	}

	private parseList(value: string): string[] {
		return value
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		const s = this.plugin.settings;

		containerEl.createEl("h2", { text: "Graph Declutter" });

		new Setting(containerEl)
			.setName("Trash folder")
			.setDesc("Flagged notes are moved here (never deleted).")
			.addText((t) =>
				t
					.setPlaceholder("_trash")
					.setValue(s.trashFolder)
					.onChange(async (v) => {
						s.trashFolder = v.trim() || "_trash";
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Clutter detection" });

		new Setting(containerEl)
			.setName("Flag empty notes")
			.setDesc("Notes with no body content (frontmatter only).")
			.addToggle((t) =>
				t.setValue(s.flagEmpty).onChange(async (v) => {
					s.flagEmpty = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Flag stub notes")
			.setDesc("Notes shorter than the word count below.")
			.addToggle((t) =>
				t.setValue(s.flagStubs).onChange(async (v) => {
					s.flagStubs = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Stub word threshold")
			.setDesc("Notes with fewer words than this are stubs.")
			.addText((t) =>
				t.setValue(String(s.stubMinWords)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!Number.isNaN(n) && n >= 0) {
						s.stubMinWords = n;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Flag orphan notes")
			.setDesc("Notes with no incoming and no outgoing links. Disable if your orphans are intentional.")
			.addToggle((t) =>
				t.setValue(s.flagOrphans).onChange(async (v) => {
					s.flagOrphans = v;
					await this.plugin.saveSettings();
				})
			);

		containerEl.createEl("h3", { text: "Spam detection" });

		new Setting(containerEl)
			.setName("Flag spam patterns")
			.setDesc("Match the regexes below (case-insensitive) against note bodies.")
			.addToggle((t) =>
				t.setValue(s.flagSpam).onChange(async (v) => {
					s.flagSpam = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Spam regex patterns")
			.setDesc("One regular expression per line. Invalid patterns are ignored.")
			.addTextArea((t) => {
				t.setValue(this.textList(s.spamPatterns)).onChange(async (v) => {
					s.spamPatterns = this.parseList(v);
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 4;
				t.inputEl.addClass("graph-declutter-textarea");
			});

		new Setting(containerEl)
			.setName("Flag link farms")
			.setDesc("Notes that are mostly external links with little text.")
			.addToggle((t) =>
				t.setValue(s.flagLinkFarms).onChange(async (v) => {
					s.flagLinkFarms = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Link farm URL threshold")
			.setDesc("Minimum URLs (and >= word count) to count as a link farm.")
			.addText((t) =>
				t.setValue(String(s.linkFarmMinUrls)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!Number.isNaN(n) && n >= 1) {
						s.linkFarmMinUrls = n;
						await this.plugin.saveSettings();
					}
				})
			);

		containerEl.createEl("h3", { text: "Protection" });

		new Setting(containerEl)
			.setName("Protected tags")
			.setDesc("Notes with any of these tags are never flagged. One per line, with or without #.")
			.addTextArea((t) => {
				t.setValue(this.textList(s.protectTags)).onChange(async (v) => {
					s.protectTags = this.parseList(v);
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 2;
			});

		new Setting(containerEl)
			.setName("Ignored folders")
			.setDesc("Folder prefixes to skip entirely. One per line, e.g. Templates/.")
			.addTextArea((t) => {
				t.setValue(this.textList(s.ignoreFolders)).onChange(async (v) => {
					s.ignoreFolders = this.parseList(v);
					await this.plugin.saveSettings();
				});
				t.inputEl.rows = 2;
			});

		containerEl.createEl("h3", { text: "Edge discovery" });

		new Setting(containerEl)
			.setName("Link insertion mode")
			.setDesc(
				"Inline: turn the first mention into a [[wikilink]] in place. " +
					"Related-notes section: leave prose untouched and append links under a heading."
			)
			.addDropdown((d) =>
				d
					.addOption("inline", "Inline wikilinks")
					.addOption("section", "Related-notes section")
					.setValue(s.linkInsertMode)
					.onChange(async (v) => {
						s.linkInsertMode = v === "section" ? "section" : "inline";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Related section heading")
			.setDesc("Heading used in section mode (created at the bottom of the note when missing).")
			.addText((t) =>
				t
					.setPlaceholder("Related notes")
					.setValue(s.relatedSectionHeading)
					.onChange(async (v) => {
						s.relatedSectionHeading = v.trim() || "Related notes";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Minimum title length")
			.setDesc("Ignore note titles/aliases shorter than this when auto-linking.")
			.addText((t) =>
				t.setValue(String(s.linkMinTitleLength)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!Number.isNaN(n) && n >= 1) {
						s.linkMinTitleLength = n;
						await this.plugin.saveSettings();
					}
				})
			);

		new Setting(containerEl)
			.setName("Whole-word matches only")
			.setDesc("Require a word boundary before inserting a link.")
			.addToggle((t) =>
				t.setValue(s.linkWholeWord).onChange(async (v) => {
					s.linkWholeWord = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Case-sensitive matching")
			.addToggle((t) =>
				t.setValue(s.linkCaseSensitive).onChange(async (v) => {
					s.linkCaseSensitive = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Use aliases")
			.setDesc("Also match a note's frontmatter aliases.")
			.addToggle((t) =>
				t.setValue(s.linkUseAliases).onChange(async (v) => {
					s.linkUseAliases = v;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Max new links per note")
			.setDesc("Cap links added to a single note per run (0 = unlimited).")
			.addText((t) =>
				t.setValue(String(s.linkMaxPerNote)).onChange(async (v) => {
					const n = parseInt(v, 10);
					if (!Number.isNaN(n) && n >= 0) {
						s.linkMaxPerNote = n;
						await this.plugin.saveSettings();
					}
				})
			);
	}
}
