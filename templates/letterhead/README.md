# JCPPL Company Letterhead

Official letterhead of **Jagannath Corporation Projects Pvt. Ltd. (JCPPL)**.
All company documents (letters, memos, purchase orders, certificates, …)
must be created on this letterhead — see the rule in the repository root
`CLAUDE.md`.

| File | Purpose |
|---|---|
| `JCPPL_letterhead.doc` | Original letterhead as supplied by the company (Word 97-2003). Do not edit — kept as the reference copy. |
| `JCPPL_letterhead.docx` | Professionally redesigned letterhead template. **Start new documents from this file.** |
| `JCPPL_letterhead_preview.pdf` | Rendered preview of the letterhead for quick visual reference. |
| `jcppl_logo.png` | Company logo extracted from the letterhead, corrected to true display proportions (528×443). Use for HTML/PDF/slide outputs. |

## Creating a new document on the letterhead

The letterhead sits in the page **header** of `JCPPL_letterhead.docx`
(`word/header1.xml` / `word/header2.xml`), so it appears automatically:

1. Copy `JCPPL_letterhead.docx` to the new document name.
2. Add body content (edit `word/document.xml`, or open in Word and type).
3. Leave the header parts and `word/media/image1.png` untouched.

## About the design

`JCPPL_letterhead.docx` is a clean redesign of the original letterhead
(the original `.doc` is retained unchanged as the reference; an exact
replica of its layout exists in git history):

- First page: logo at the far top left (0.6" from the page edge), the
  company name in large type starting right next to it, and the full
  details on exactly two smaller lines directly under the name (address on
  one line; phone · email · CIN on the other). Continuation pages (2+)
  are blank.
- Company name in Cambria Bold 20 pt, brand green (`#00B050`); detail
  lines in Cambria 8.5 pt. Cambria ships with Microsoft Office, so the
  template renders the same everywhere.
- Layout is a fixed-width borderless table — no manual-space alignment, so
  it cannot fall apart under font substitution.
- A4 page, 1" side margins, body font Cambria 11 pt.

## Company details

- Jagannath Corporation Projects Pvt. Ltd.
- Plot 397, Lewis Road, Sarangi Bhawan (Ground Floor), Old Town, Bhubaneswar-751002, Odisha
- Phone: +91-7894444400 · Email: info@jcltd.in
- CIN: U27100OR2010PTC011664
