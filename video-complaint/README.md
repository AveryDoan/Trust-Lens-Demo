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
