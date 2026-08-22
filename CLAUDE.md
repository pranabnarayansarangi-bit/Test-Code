# Project Memory

## Company letterhead — always use it

Every letter, memo, purchase order, certificate, or other official company
document generated in this project MUST be produced on the official company
letterhead stored in `templates/letterhead/`. Never create a document on a
plain page or invent a new letterhead design.

Company details (as they appear on the letterhead):

- **Company:** Jagannath Corporation Projects Pvt. Ltd. (JCPPL)
- **Address:** Plot 397, Lewis Road, Sarangi Bhawan (Ground Floor), Old Town, Bhubaneswar-751002, Odisha
- **Phone:** +91-7894444415
- **Email:** info@jcltd.in
- **CIN:** U27100OR2010PTC011664

### How to use the template

- Start every new Word document from `templates/letterhead/JCPPL_letterhead.docx`.
  The letterhead (logo + company details) lives in the page header, so write
  body content only — do not modify the header.
- `templates/letterhead/JCPPL_letterhead.doc` is the original file supplied by
  the company. Keep it unchanged, byte for byte.
- For non-Word outputs (HTML, PDF, slides), use the extracted logo
  `templates/letterhead/jcppl_logo.png` together with the company details above.
- `templates/letterhead/JCPPL_letterhead_preview.pdf` shows the expected look;
  compare rendered output against it.

See `templates/letterhead/README.md` for file-by-file details.

## Secrets and credentials

Real credentials (such as the display computer's administrator login) are
never committed to this repository. `.env.example` documents the expected
variables; the real values go into a local `.env` copy, which is
git-ignored. Never write actual usernames, passwords, tokens, or keys into
tracked files.
