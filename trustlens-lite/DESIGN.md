# TrustLens Lite: Design

Plain HTML, CSS and JS. No build step. Token structure follows shadcn conventions (background, foreground, muted, border, accent, status), without any dashboard chrome. Nothing is copied or imported from those projects.

## The idea
The report reads like a records officer's margin notes: a clear stamp at the top, short notes beneath, the quoted evidence set on a quiet left rule. To avoid overload it is shown in **three levels of detail**. Colour carries meaning only in the stamp and the status badges.

## Canvas
Chrome side panel, 360 to 420px wide, vertical scroll only, usable at 125% zoom (288px layout width). Logical CSS properties only.

## Three levels of detail

**Level 1: the glance.** Must fit in 420 x 700 with no scrolling and hold no more than 90 words.
- Stamp (sticky): action in large type (max 6 words), one reason line (max 14 words), buttons Follow advice and Override, and an overflow menu (`...`).
- Four collapsed check rows in fixed order (Bias, Accuracy, Deception risk, Governance). Each row: name, status badge (icon + word), headline (max 8 words). Nothing else.
- Privacy line only if something was masked: "2 items masked", small and quiet.
- Footer: "Signals, not proof. A person makes the final call." and "Policy basis: RIMPA Global published governance documents".

**Level 2: one check open** (single-open accordion; opening one closes the others; the most severe check opens on load).
- One summary sentence (max 20 words). It never repeats "potential concern": the badge says it.
- The strongest quote only, with "+N more" for the rest.
- One next step (max 15 words, starts with a verb).
- One policy link styled as text, for example "Code of Professional Conduct s7.3". If no policy applies: "TrustLens guidance, not RIMPA policy".
- Governance only: one row of three small labels (Classification, Retention, Use with AI).
- Confidence, as small text, only when it is not High.
- Opening a check highlights only its quotes on the page and scrolls to the first. Closing removes them. A quote that cannot be found gets a small "not found on page" note here and nowhere else.

**Level 3: on demand.** Clicking the policy link opens a bottom sheet with document, version, section and the verbatim clause (4 lines, then "Read full clause"). It is the only raised surface. The overflow menu holds Copy citation, Show policy basis (the sheet, for the overall action), Clear highlights and Show text checked.

## Word budgets
Stamp label 6, stamp reason 14, headline 8, summary 20, next step 15. The system prompt states them and `demo.test.js` enforces them on the saved reports. CSS line-clamp is a safety net only; quotes are never cut.

## Tokens (CSS variables on `:root`; dark under `prefers-color-scheme`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAF6EE` warm paper | `#171B19` deep ink | page |
| `--surface` | `#F2EBDD` | `#1F2522` | skeleton, sheet handle |
| `--foreground` | `#1E2321` | `#ECE6D8` | text |
| `--muted-foreground` | `#4E544E` | `#B2B6AB` | secondary text, on `--background` only |
| `--border` | `#D6CCB8` | `#343B37` | hairlines |
| `--accent` | `#2B4A7A` | `#A8C0EA` | links, primary button, focus ring |
| `--accent-foreground` | `#FAF6EE` | `#171B19` | text on accent |
| `--ok` / `--ok-bg` | `#1D6A39` / `#E2EFE2` | `#86D19B` / `#1D3024` | OK badge, stamp |
| `--check` / `--check-bg` | `#774C00` / `#F6E6C0` | `#E8BD62` / `#352B10` | Check badge, stamp |
| `--concern` / `--concern-bg` | `#A1252A` / `#F6D9D5` | `#F4A29B` / `#3C1F1D` | Concern badge, stamp |

No pure black, white or flat grey. Secondary text never sits on a coloured wash. Contrast is verified by script.

## Type
Source Sans 3, self-hosted woff2 in `fonts/`. **Three sizes only:** stamp label 22px, body 14px, small 12px. Counts use tabular numerals. Quotes use the italic.

## Space, shape, motion
Spacing: 4 (hairline gaps), 8, 16 between a row's internal items, 24 between sections. One radius, 4px. Hairline borders. Shadow only on the bottom sheet.
Motion 150 to 200ms ease-out. On a new report the stamp appears first, then the rows stagger in at 80ms. No bounce. `prefers-reduced-motion` removes all of it.

## Components
1. **Header**: logo mark, wordmark, Demo mode pill, History and Settings icon buttons.
2. **Stamp** (sticky banner): icon, label, reason, Follow advice, Override, overflow menu. After a choice it shows what was recorded, with Undo. Override reveals an optional reason field.
3. **Check row**: one button (name, badge, headline, chevron) and a region. Rows are separated by hairlines. No left bars, no tinted backgrounds. Keyboard: Up/Down/Home/End move between rows, Enter or Space toggles, Escape closes.
4. **Badge**: icon shape differs per status (circle-check, triangle, octagon) so colour is never the only cue.
5. **Quote**: italic, neutral left rule.
6. **Policy link**: text button, accent, underlined.
7. **Bottom sheet**: dialog with the clause, Read full clause, Close. Escape closes and returns focus.
8. **Overflow menu**: flat list, hairline border, no shadow.

## Action to tone and icon
escalate: Concern, stop octagon. redact: Concern, redaction bars. revise: Check, pencil. verify: Check, magnifier. restrict: accent, lock. approve: OK, check circle.

## States
Empty, loading (static skeleton), report, error ("Try demo mode"), history. All render offline from the saved demo emails.

## Accessibility
Native buttons, visible 2px focus ring, live region for state changes, status never by colour alone, targets at least 36px, AA contrast in both themes.

## Preview without the extension
`panel.html#state=report|empty|loading|error|history` and `&sample=verify|clean` render from `demo-results.json` over any static server, with no network calls.

## File input
A drop zone and **Choose file** button sit in the empty state; the overflow menu also has Choose file. PDF, Word (.docx), text and Markdown are read in the panel with bundled libraries (`vendor/`, no CDN). The text is cleaned (whitespace, hyphenated line ends, curly quotes, dashes, page numbers, repeated headers), masked, cut to 6,000 characters (visible notice) and then checked like selected text. A quiet line above the report shows file name, size and characters read. Files are never highlighted on a page; the open check says "Quoted from the file". The audit record keeps the file name, type and SHA-256 of the masked text, never the file or its text.

## Case bundles (several files at once)
Dropping two or more files (plus the open email, if any) opens **Review before AI**: each file with its role chip, page count and metadata strip; the redacted text the AI will see (masked items as solid tags, a per-type count, a view-only "Show original"); the privacy notice (in live mode with a pack that forbids external AI, the gate wording); **Run AI** and **Cancel**. Nothing is sent until Run AI. In Demo mode Run AI shows four progress steps for about 2.6 seconds, then the saved result. Footer: "Demo mode: saved result" and the active pack.

Level 1 (110 words or fewer, 420 x 700): document chips plus "Provenance: check" when a file has signals; the stamp (primary step, reason, owner and due); "Then" with three steps; the checks as rows, OK rows collapsed to one line. Level 2: Accuracy opens a reconciliation table (Item, Agreed, Billed, Difference, amounts right-aligned, one source quote per row), the claims list and the provenance signals; Misleading shows its quotes; Governance shows what was found, clause links and all steps; a chip opens File details. Level 3 is the clause sheet with Copy citation. The organisation profile (options) picks the policy pack, the footer and the cited documents.

## Gmail (demo account only)
On a Gmail page the empty state shows **Use this email**. Nothing is read until it is pressed, and only when Settings has "Enable Gmail reading" on and the account shown in Gmail equals the demo address (otherwise: "Gmail reading is off for this account. Use a demo account."). The reader returns subject, sender, sent date, the open message body and the attachment chips; the service worker downloads each attachment with the browser's own session, from `mail.google.com` and `mail-attachment.googleusercontent.com` only. The bundle then goes through Review before AI like dropped files: the email is listed as *Email*, a procedure PDF as *Policy*, and a chip that could not be read as *Not read* with a **Drop file** target. If no agreement is in the bundle the result says so and shows no agreed-side quote from the saved text. Fallbacks: selected text on the page, then the drop zone; the panel says which path was used.
