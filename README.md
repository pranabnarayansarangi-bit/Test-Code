# Graph Declutter — an Obsidian plugin

Keep your Obsidian graph clean: **remove clutter and spam notes (nodes)** and
**discover the missing links (edges)** between the notes you keep.

In Obsidian's graph view every note is a *node* and every `[[wikilink]]` is an
*edge*. Over time a vault accumulates empty notes, one-line stubs, orphans, and
pasted-in spam that clutter the graph — while genuinely related notes often sit
unconnected because nobody ever linked them. This plugin tackles both.

## Features

### 1. Find clutter & spam nodes
Scans the vault and flags notes that are:

- **empty** — no body content (frontmatter only)
- **stubs** — fewer than *N* words (configurable)
- **orphans** — no incoming *and* no outgoing links (off by default)
- **spam** — matches your regex patterns (case-insensitive)
- **link farms** — mostly external links with little text

Nothing is deleted. Flagged notes are shown in a preview with checkboxes; the
ones you approve are **moved to a trash folder** (default `_trash/`) using
Obsidian's link-aware rename, so inbound links are updated rather than broken.

### 2. Find missing links (edges)
Scans every note for plain-text mentions of another note's **title or alias**
that aren't yet linked, and proposes turning the first mention into a
`[[wikilink]]`. Code blocks, existing links, and URLs are never touched. You
review each proposed edge with context and choose which to insert.

### 3. Fuzzy title matching (opt-in)
A literal scan only finds a title spelled exactly as the note names it, so a
note called `Neural Network` stays unlinked from every mention of *neural
networks*. Turn on **fuzzy title matching** and a second pass catches mentions
that differ by:

- **casing and punctuation** — `machine-learning` → `[[Machine Learning]]`
- **accents** — `cafe culture` → `[[Café Culture]]`
- **plurals** — `neural networks` → `[[Neural Network]]`
- **typos** — `Kubernets` → `[[Kubernetes]]`, up to 3 characters' difference

The literal pass always runs first and claims its matches, so an approximate
match can only ever fill a gap the exact pass left behind. Matches are inserted
as `[[Neural Network|neural networks]]`, keeping your prose exactly as written.

Because these are guesses, they are labelled with a confidence percentage and
**start unchecked** in the review list — "select all" will not sweep them in.
Titles under 5 characters are never matched this way, and matching is always
whole-word.

The **similarity threshold** controls how far a mention may stray. At `1` only
the casing/punctuation/accent/plural variants match and the pass is essentially
free; lower it to admit misspellings, at some cost in scan time and in false
positives to review.

## Commands

- **Find clutter & spam nodes (review, then trash)**
- **Find missing links (edges) between notes**

Both open a review modal — nothing changes until you confirm. There's also a
ribbon button (broom icon) for the declutter scan.

## Settings

Configure the trash folder, which clutter/spam checks run and their thresholds,
protected tags (e.g. `keep`) and ignored folders, the edge-discovery rules
(minimum title length, whole-word / case-sensitive matching, aliases, and a cap
on new links per note), and fuzzy matching with its similarity threshold.

## Development

```bash
npm install
npm run build     # typecheck + bundle to main.js
npm run dev       # watch mode
npm test          # run the unit tests
```

To try it in a vault, copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/graph-declutter/` and enable the plugin.

## Safety notes

- The declutter action **moves** notes to a trash folder; it never deletes them.
- Orphan flagging is **off by default** because orphans are frequently intentional.
- Edge discovery adds **one** link per note pair (the first mention) to avoid
  re-cluttering, and skips code, URLs, and existing links.
- Fuzzy matching is **off by default**, and its suggestions start unchecked —
  an approximate match is a guess and is meant to be read before it is accepted.
