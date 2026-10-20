# TrustLens Lite: 30-second complaint demo (Remotion)

1920x1080, 30 fps, 900 frames, silent MP4. One case: the complaint email is the background, the side panel is drawn on the right at 2.4x. All people, companies and numbers are fictional. This folder does not change the extension.

## Story (5 scenes)

| Scene | Frames | What it shows |
|---|---|---|
| S1 | 0-89 | The complaint email (screenshot of the test message, `public/mail-background.png`) |
| S2 | 90-309 | The panel reads it: the stamp (finding becomes next step), then the checks named: Bias, Governance, Policy |
| S3 | 310-539 | The main step: Agreed vs billed, quoted from the files ("Found in Agreement, page 1"), then the rule with Copy citation |
| S4 | 540-779 | The privacy step: quotes with [DOB] and [ADDRESS] masked, each "Found in ..." its file, then the rule |
| S5 | 780-899 | End card |

## Run it

```
npm install          # first time only
npm run sync         # copies the saved data from ../trustlens-lite/demo/case-complaint, recounts masked items,
                     # and checks every evidence quote against the real PDFs and the email (product's evidence.js)
npx remotion studio src/index.ts      # live preview (or: npm run dev)
npm run check        # frames, captions, and every number, date, clause and quote on screen against the JSON
npm run render       # out/complaint-demo.mp4 (about 1 minute)
npm run stills       # out/stills/: the middle frame of each scene
```

Notes for this Mac: `remotion.config.ts` uses the system Chrome. If a render fails with `spawn ... -88`, run `chmod +x node_modules/@remotion/compositor-darwin-arm64/remotion node_modules/@remotion/compositor-darwin-arm64/ffmpeg node_modules/@remotion/compositor-darwin-arm64/ffprobe`.

## Where things are

| Path | What it is |
|---|---|
| `src/timeline.json` | Frame ranges and captions (global frames). Edit timing here. |
| `src/scenes/scenes.tsx` | The five scenes and the camera moves. |
| `src/components/panel.tsx` | The 420 px side panel as in the product (result, evidence step). |
| `src/facts.ts` | Turns the JSON into the text shown on screen. No amounts, dates, quotes or clauses are typed anywhere else. |
| `src/data/` | Copies of the product's JSON (do not edit; run `npm run sync`), plus `counts.json` and `evidence-resolved.json` generated from the real files. |
| `public/mail-background.png` | The email screenshot. Replace it to change the background. |

## Honesty notes

- Result scenes carry "Demo mode: saved example". The results are the saved example for this case, not a live model call.
- Every quote on screen verified against the real files (13 of 13 in the five steps). `npm run sync` fails the build if one does not, because the video only shows verified quotes.
- The email quotes were verified against the text of the Gmail test fixture, which matches the screenshot's message.
- The background screenshot is of the fictional test account. It shows a mail app's own interface and an avatar; replace it if you want a generic screen.

---

# The 60 second version (composition `ComplaintDemo60`)

1920 x 1080, 30 fps, exactly 1800 frames. Your Gmail screenshot (`public/screens/gmail-complaint.png`, 1694 x 928) is the base of every email shot; the TrustLens panel is a simulated 420 px panel drawn at 2.2x and docked on the right. Light theme throughout (the tokens in `src/theme.ts`, from `trustlens-lite/DESIGN.md`).

## Render

```
npm run render60     # syncs the data, then writes both files below (about 5 minutes)
npm run stills60     # out/stills/60-S1..S6 (middle frame of each scene) and out/stills/boxes.png
npm run check        # frames, captions, boxes, camera, and every number, date, clause and quote against the JSON
npx remotion studio src/index.ts      # pick ComplaintDemo60 in the sidebar
```

- `out/complaint-demo-60-captions.mp4`: burned-in captions (48 px, at most 8 words, one at a time).
- `out/complaint-demo-60-clean.mp4`: no captions, for your voice. Both come from one composition prop, `captions` (`--props='{"captions":false}'` for one-off renders).
- If `public/voiceover.mp3` exists it plays from frame 0 in both; otherwise the files are silent. No music. Restart Studio after adding the file.

## Edit it

| What | Where |
|---|---|
| Scene frames and captions | `src/data/timeline60.json` (global frames; scenes must cover 0-1799) |
| Camera moves (zoom and pan on the screenshot) | `src/data/camera.json`: keyframes `{frame, cx, cy, scale}` in screenshot pixels, max 2.8x, ease-in-out. Two keyframes with the same values make a hold |
| Highlight boxes | `src/data/highlights.json`: `[x1, y1, x2, y2]` in screenshot pixels. Run `npm run stills60` and look at `out/stills/boxes.png` after nudging |
| What the highlights say and when they draw | `src/scenes60/Scenes60.tsx` (`<Highlight id=... from=... to=...>`) |
| Panel screens | `src/components/panel.tsx`, `src/components/panel60.tsx` |
| Words on screen | `src/facts.ts` builds them from the JSON in `src/data/` (never retyped) |

## Swap a simulated scene for a clip

Record the clip as in `RECORDING-GUIDE-60.md` and save it as `public/clips/<name>.mp4` (`s1-gmail-scroll`, `s2-panel-open`, `s3-consent-review`, `s4-checks`, `s5-attachments`, `s6-next-step`). Restart Studio or re-run `npm run render60`. The scene plays the clip, trimmed or sped up to fit (`src/data/clips60.json`), with the camera keyframes still applied. Delete the file to go back to the simulation. `npm run render60` prints which scenes used clips.

## What is and is not real

- The email screenshot is yours; Gmail's own branding appears only inside it.
- The panel screens are a simulation of the current panel, built from the saved example JSON. Result scenes carry "Demo mode: saved example".
- The permission screen in S3 ("Allow TrustLens to read") is a mock-up: the extension does not show it today.
- `demo-action-plan.json` does not exist in the repo, so the path and "Who to contact" are built from the result and the findings map.
- The email quotes are checked against `src/data/email-from-screenshot.txt`, the text read off your screenshot, until `trustlens-lite/demo/case-complaint/case-email.txt` exists (the script uses that file when it is there).
- The invoice and correspondence "pages" in S5 are excerpts of the real extracted, redacted PDF text (the file `01-invoice-INV-DEMO-20417.md` named in the brief is not in the repo).
