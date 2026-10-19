# TrustLens Lite: Design

Plain HTML, CSS and JS. No build step. Token structure follows shadcn conventions (background, foreground, muted, border, accent, status), without any dashboard chrome. Nothing is copied or imported from those projects.

## Canvas
Chrome side panel, 360 to 420px wide, vertical scroll only. Must work at 125% zoom, which is a 288px layout width. Logical CSS properties only (`margin-inline`, `padding-block`, `inset-inline-start`).

## Tokens (CSS variables on `:root`; dark under `prefers-color-scheme`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAF6EE` warm paper | `#171B19` deep ink | page |
| `--surface` | `#F2EBDD` | `#1F2522` | stamp wash, skeleton, hover |
| `--foreground` | `#1E2321` | `#ECE6D8` | text |
| `--muted-foreground` | `#4E544E` | `#B2B6AB` | secondary text, on `--background` only |
| `--border` | `#D6CCB8` | `#343B37` | hairlines |
| `--accent` | `#2B4A7A` | `#A8C0EA` | links, buttons, focus ring |
| `--accent-foreground` | `#FAF6EE` | `#171B19` | text on accent |
| `--ok` / `--ok-bg` | `#1D6A39` / `#E2EFE2` | `#86D19B` / `#1D3024` | status OK |
| `--check` / `--check-bg` | `#774C00` / `#F6E6C0` | `#E8BD62` / `#352B10` | status Check |
| `--concern` / `--concern-bg` | `#A1252A` / `#F6D9D5` | `#F4A29B` / `#3C1F1D` | status Concern |

Rules: no pure black, white or flat grey. Secondary text never sits on a coloured wash; on washes use `--foreground`. Contrast is verified by script (see Review).

## Type
Source Sans 3, self-hosted woff2 in `fonts/` (400, 600, 700, 400 italic). Fallback only if the file fails to load.
Four steps (rem, 1rem = 16px): `--text-sm` 0.875 (14px: meta, badges), `--text-base` 1 (16px: body), `--text-lg` 1.25 (20px: wordmark, row names), `--text-xl` 1.625 (26px: stamp label). Line height 1.45 body, 1.2 headings. Counts use `font-variant-numeric: tabular-nums`. Quotes use the italic.

## Space, shape
8px base: `--space-1` 4px (hairline gaps only), `--space-2` 8, `--space-3` 16, `--space-4` 24, `--space-5` 32. One radius: `--radius` 4px. Hairline 1px borders. Shadows: none.

## Motion
150 to 200ms, `cubic-bezier(0.2, 0, 0, 1)` (ease-out). On report arrival the stamp fades and rises 6px over 200ms, then the four rows follow with 80ms stagger. No bounce. `prefers-reduced-motion: reduce` removes all animation.

## Components
1. **Header**: wordmark, optional Demo mode pill (text plus dashed border), settings icon button.
2. **Stamp** (banner, full width, top rule 4px in the tone colour): icon, label (largest text), one-line reason, buttons Follow advice and Override. After a choice it shows what was recorded, with Undo. Override reveals an optional reason field.
3. **Privacy line**: `<details>`, summary "3 items masked before checking", body lists types.
4. **Finding row** (four siblings in one list, hairline between, no cards): `<details>` with summary showing status badge (icon + word + colour), name, one-sentence summary, confidence. Body: quotes, claims, signals, governance fields, next step.
5. **Badge**: icon shape differs per status (circle-check, triangle, octagon) so colour is never the only cue.
6. **Quote**: 3px left rule in the tone colour, italic, the evidence exactly as found.
7. **Claim line**: label with icon (Supported, Contradicted, Unverified), claim text, policy id.
8. **Footer**: "Signals, not proof. A person makes the final call." and History button.
9. **Buttons**: primary (accent fill), secondary (hairline border). Min height 36px. Focus ring: 2px `--accent`, 2px offset, on every control.

## Action to tone and icon
escalate: Concern, stop octagon. redact: Concern, redaction bars. revise: Check, pencil. verify: Check, magnifier. restrict: accent, lock. approve: OK, check circle.

## States
- **Empty**: "Nothing checked yet." with the two ways to start, and the text box.
- **Loading**: skeleton stamp and four skeleton rows, slow opacity pulse, status text "Checking. This usually takes under 10 seconds."
- **Report**: as above.
- **Error**: what happened, what to do next, buttons Try demo mode and Try again.
- **History**: list of past checks (time, action, decision), Back and Clear history. Stores no text.

## Accessibility
Native `<details>`/`<button>`. Visible focus ring. Live region announces state changes. Status never by colour alone. Targets at least 36px. AA contrast in both themes.

## Preview without the extension
`panel.html#state=report|empty|loading|error|history` and `&sample=clean` render from `sample-report.json` over any static server, with no network calls.
