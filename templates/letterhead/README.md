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

The `.docx` reproduces the company's reference letterhead exactly (title
and address positions verified within 1–2 pt against the company's own PDF
export), but is structurally robust where the original was fragile:

- The original aligned the address block with long runs of literal space
  characters, which broke on any machine without the exact fonts. The
  company name and each address line are now separate paragraphs with
  fixed indents inside the header's layout table, so alignment holds under
  font substitution. All text is verbatim from the original.
- The company name is set in Times New Roman Bold — the font the letterhead
  actually prints in. (The original nominally asked for "Garamond Premr
  Pro", a font not installed even on the company's own computer, so Word
  has always silently substituted Times New Roman.)
- The continuation-page (page 2+) header contained leftover text from an
  unrelated company ("Jagannath Crushers") hidden in the original file;
  it is now blank, so multi-page documents get a clean second page.

## Company details

- Jagannath Corporation Projects Pvt. Ltd.
- Plot 397, Lewis Road, Sarangi Bhawan (Ground Floor), Old Town, Bhubaneswar-751002, Odisha
- Phone: +91-7894444400 · Email: info@jcltd.in
- CIN: U27100OR2010PTC011664
