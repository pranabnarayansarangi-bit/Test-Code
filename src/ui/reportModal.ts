import { App, Modal, Setting } from "obsidian";

export interface ReportItem {
	/** Primary label (e.g. note path). */
	title: string;
	/** Secondary detail (e.g. reasons, matched context). */
	detail: string;
	/** Whether the checkbox starts checked. */
	checked: boolean;
}

/**
 * A generic preview modal: lists items with checkboxes and an action button.
 * Nothing is changed until the user clicks the action button.
 */
export class ReportModal extends Modal {
	private selected: boolean[];

	constructor(
		app: App,
		private opts: {
			heading: string;
			emptyText: string;
			actionLabel: string;
			items: ReportItem[];
			onConfirm: (indices: number[]) => Promise<void>;
		}
	) {
		super(app);
		this.selected = opts.items.map((i) => i.checked);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("graph-declutter-modal");
		contentEl.createEl("h2", { text: this.opts.heading });

		if (this.opts.items.length === 0) {
			contentEl.createEl("p", { text: this.opts.emptyText });
			new Setting(contentEl).addButton((b) =>
				b.setButtonText("Close").onClick(() => this.close())
			);
			return;
		}

		const controls = contentEl.createDiv({ cls: "graph-declutter-controls" });
		controls.createSpan({
			text: `${this.opts.items.length} item(s) found.`,
			cls: "graph-declutter-count",
		});
		const listEl = contentEl.createDiv({ cls: "graph-declutter-list" });

		const checkboxes: HTMLInputElement[] = [];
		this.opts.items.forEach((item, idx) => {
			const row = listEl.createDiv({ cls: "graph-declutter-row" });
			const cb = row.createEl("input", { type: "checkbox" });
			cb.checked = this.selected[idx];
			cb.addEventListener("change", () => (this.selected[idx] = cb.checked));
			checkboxes.push(cb);

			const text = row.createDiv({ cls: "graph-declutter-text" });
			text.createDiv({ cls: "graph-declutter-title", text: item.title });
			text.createDiv({ cls: "graph-declutter-detail", text: item.detail });
		});

		const setAll = (value: boolean) => {
			this.selected = this.selected.map(() => value);
			checkboxes.forEach((cb) => (cb.checked = value));
		};

		new Setting(controls)
			.addButton((b) => b.setButtonText("Select all").onClick(() => setAll(true)))
			.addButton((b) => b.setButtonText("Select none").onClick(() => setAll(false)));

		new Setting(contentEl)
			.addButton((b) =>
				b
					.setButtonText(this.opts.actionLabel)
					.setCta()
					.onClick(async () => {
						const indices = this.selected
							.map((v, i) => (v ? i : -1))
							.filter((i) => i >= 0);
						this.close();
						await this.opts.onConfirm(indices);
					})
			)
			.addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()));
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
