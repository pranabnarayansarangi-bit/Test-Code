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
- **orphans** — no incoming *and* no outgoing links
- **spam** — matches your regex patterns (case-insensitive)
- **link farms** — mostly external links with little text

Nothing is deleted. Flagged notes are shown in a preview with checkboxes; the
ones you approve are **moved to a trash folder** (default `_trash/`) using
Obsidian's link-aware rename, so inbound links are updated rather than broken.

### 2. Find missing links (edges)
Scans every note for plain-text mentions of another note's **title or alias**
that aren't yet linked, and proposes an edge for each. Code blocks, existing
links, and URLs are never touched, and notes that already link to a target are
skipped. You review each proposed edge with context and choose which to insert.

Two insertion modes (configurable):

- **Inline** (default) — the first plain-text mention becomes a `[[wikilink]]`
  in place, preserving your prose (`[[Note|mention]]` when the casing differs).
- **Related-notes section** — prose is left untouched; accepted links are
  appended as bullets under a `## Related notes` heading (configurable) at the
  bottom of the note, created if missing.

## Commands

- **Find clutter & spam nodes (review, then trash)**
- **Find missing links (edges) between notes**

Both open a review modal — nothing changes until you confirm. There's also a
ribbon button (broom icon) for the declutter scan.

## Settings

Configure the trash folder, which clutter/spam checks run and their thresholds,
protected tags (e.g. `keep`) and ignored folders, and the edge-discovery rules
(minimum title length, whole-word / case-sensitive matching, aliases, and a cap
on new links per note).

## Development

```bash
npm install
npm run build     # typecheck + bundle to main.js
npm run dev       # watch mode
```

To try it in a vault, copy `main.js`, `manifest.json`, and `styles.css` into
`<vault>/.obsidian/plugins/graph-declutter/` and enable the plugin.

## Safety notes

- The declutter action **moves** notes to a trash folder; it never deletes them.
- Every flagged note is reviewed in a checkbox modal first — untick anything
  you want to keep (or protect it permanently with a `keep` tag).
- Edge discovery adds **one** link per note pair (the first mention) to avoid
  re-cluttering, and skips code, URLs, and existing links.
