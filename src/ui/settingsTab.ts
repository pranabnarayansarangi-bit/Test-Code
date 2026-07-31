import { App, PluginSettingTab, Setting } from "obsidian";
import type GraphDeclutterPlugin from "../../main";
import {
	FUZZY_MAX_EDITS,
	FUZZY_MIN_TITLE_LENGTH,
	FUZZY_THRESHOLD_MAX,
	FUZZY_THRESHOLD_MIN,
	clampFuzzyThreshold,
} from "../settings";

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
			.setDesc("Notes with no incoming and no outgoing links. Off by default — orphans are often intentional.")
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

		containerEl.createEl("h3", { text: "Fuzzy edge discovery" });

		new Setting(containerEl)
			.setName("Fuzzy title matching")
			.setDesc(
				"After the exact pass, also match mentions that differ in casing, " +
					"punctuation, accents or plurals — and, below a similarity of 1, " +
					`typos of up to ${FUZZY_MAX_EDITS} characters. Titles shorter than ` +
					`${FUZZY_MIN_TITLE_LENGTH} characters are never matched this way. ` +
					"Fuzzy matches are always whole-word and always case-insensitive, " +
					"and they start unchecked in the review list."
			)
			.addToggle((t) =>
				t.setValue(s.linkFuzzy).onChange(async (v) => {
					s.linkFuzzy = v;
					await this.plugin.saveSettings();
					this.display();
				})
			);

		if (s.linkFuzzy) {
			new Setting(containerEl)
				.setName("Similarity threshold")
				.setDesc(
					`How close a mention must be, from ${FUZZY_THRESHOLD_MIN} to ` +
						`${FUZZY_THRESHOLD_MAX}. At ${FUZZY_THRESHOLD_MAX} only ` +
						"casing/punctuation/accent/plural variants match; lower values " +
						"start admitting misspellings."
				)
				.addSlider((sl) =>
					sl
						.setLimits(FUZZY_THRESHOLD_MIN, FUZZY_THRESHOLD_MAX, 0.01)
						.setValue(clampFuzzyThreshold(s.linkFuzzyThreshold))
						.setDynamicTooltip()
						.onChange(async (v) => {
							s.linkFuzzyThreshold = clampFuzzyThreshold(v);
							await this.plugin.saveSettings();
						})
				);
		}
	}
}
