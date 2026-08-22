# JCPPL Company Letterhead

Official letterhead of **Jagannath Corporation Projects Pvt. Ltd. (JCPPL)**.
All company documents (letters, memos, purchase orders, certificates, …)
must be created on this letterhead — see the rule in the repository root
`CLAUDE.md`.

| File | Purpose |
|---|---|
| `JCPPL_letterhead.doc` | Original letterhead as supplied by the company (Word 97-2003). Do not edit — kept as the reference copy. |
| `JCPPL_letterhead.docx` | Working template in modern Word format, converted from the original with the header rebuilt for robust alignment. **Start new documents from this file.** |
| `JCPPL_letterhead_preview.pdf` | Rendered preview of the letterhead for quick visual reference. |
| `jcppl_logo.png` | Company logo extracted from the letterhead, corrected to true display proportions (528×443). Use for HTML/PDF/slide outputs. |

## Creating a new document on the letterhead

The letterhead sits in the page **header** of `JCPPL_letterhead.docx`
(`word/header1.xml` / `word/header2.xml`), so it appears automatically:

1. Copy `JCPPL_letterhead.docx` to the new document name.
2. Add body content (edit `word/document.xml`, or open in Word and type).
3. Leave the header parts and `word/media/image1.png` untouched.

## How the .docx differs from the original .doc

The original file positioned the address block with long runs of literal
space characters, so it fell apart on any machine without the exact fonts
(Cambria, Garamond Premier Pro). The `.docx` keeps the same first-page
design — same logo placement, green title, fonts, and colors — but is
structurally rebuilt:

- The company name and each address line are separate centered paragraphs
  (no manual-space alignment), so the layout holds even under font
  substitution.
- Minor punctuation spacing normalized; `CIN-…` is now written `CIN: …`.
- The continuation-page (page 2+) header contained leftover text from an
  unrelated company ("Jagannath Crushers") hidden in the original file;
  it is now blank, so multi-page documents get a clean second page.

## Company details

- Jagannath Corporation Projects Pvt. Ltd.
- Plot 397, Lewis Road, Sarangi Bhawan (Ground Floor), Old Town, Bhubaneswar-751002, Odisha
- Phone: +91-7894444400 · Email: info@jcltd.in
- CIN: U27100OR2010PTC011664
