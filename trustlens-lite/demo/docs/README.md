# Demo documents

Four fictional documents for the TrustLens Lite file check. All people and numbers are made up. **Do not edit the wording**: the saved results in `demo-results.json` depend on it.

| File | Expected result in Demo mode |
|---|---|
| `01-case-note.md` | escalate |
| `02-election-flyer.md` | verify |
| `03-governance-update.md` | approve |
| `04-ai-briefing.md` | revise |

## Export each one to PDF with selectable text

The PDF must contain real text, not a picture of text. Any of these works:

- **pandoc:** `pandoc 01-case-note.md -o ../files/01-case-note.pdf` (needs a PDF engine such as `pdflatex` or `wkhtmltopdf`; or add `--pdf-engine=weasyprint`).
- **VS Code:** install the "Markdown PDF" extension, open the file, run "Markdown PDF: Export (pdf)".
- **Browser:** open the `.md` in a Markdown preview (VS Code preview or GitHub), then Print and choose "Save as PDF".

Save the PDFs in `demo/files/` with the same base names, for example `demo/files/01-case-note.pdf`.

Check that the export has selectable text: open it and try to select a sentence. If you cannot, TrustLens will say "This PDF has no readable text, it may be a scan".

The `.md` files can be dropped in as they are. You can also save each as `.txt`, or make a `.docx` copy in Word, and drop that in: the result should be the same.
