# TrustLens Lite: 28 second intro video

Remotion project. 1920x1080, 30 fps, 840 frames (28 s). Captions are burned in, so it works with the sound off.

```
npm install
npm run dev          # Remotion Studio, scrub and edit live
npx remotion render src/index.ts TrustLensIntro out/trustlens-intro.mp4
```

`npm run build` does the same render. `npx remotion still src/index.ts TrustLensIntro out/f270.png --frame=270` saves one frame. On a Mac the config uses the Chrome in `/Applications` if it finds one.

## Two modes

- **No clips (default):** Gmail and Drive are drawn as a **simulated screen**, using generic names ("Email app", "File storage", no logos) and the real panel data from `demo-results.json`. A small "Simulated screen" label is shown on it.
- **With clips:** drop real recordings into `public/clips/` and the video uses them instead. The "Simulated screen" label disappears. **Restart Studio after adding or removing a file** (the list of files is read when Studio or a render starts).

What the video does and does not show: Gmail is a selection in an open email, then "Check with TrustLens". Drive is a file downloaded from Drive and dropped into the panel, with the caption "Direct Drive integration: next step". Nothing implies Drive is read automatically.

## The two clips to record

Use the fictional test account only. 1080p, browser at **125% zoom**, notifications off, the TrustLens extension loaded and **Demo mode on**.

**`public/clips/gmail.mp4` (about 12 s)**
1. Start on the inbox with the three labelled demo emails.
2. Open email A.
3. Triple-click the paragraph "Following up on the complaint about Casey Doyle...".
4. Right-click, choose **Check with TrustLens**.
5. Wait for the stamp ("Do not distribute until reviewed") and the first check to open.

**`public/clips/drive.mp4` (about 12 s)**
1. Start in the Drive folder with the four demo PDFs (`demo/files/`).
2. Right-click `04-ai-briefing.pdf`, choose **Download**.
3. Drag the downloaded file into the TrustLens panel.
4. Wait for the stamp ("Revise before using").

Record at a calm pace, with no mouse wandering. Panel on the right edge, as in Chrome's side panel.

## Edit the copy and timing: `src/script.ts`

Everything lives there: scene lengths (`scenes`), every line of text, caption timing, cursor paths, callout labels and where they sit, zoom timing.

- **Captions** are limited to 8 words (the project throws a clear error if you go over). Scene lengths must add up to 840 frames.
- **Callouts:** each has `label`, `from`/`to` (frames inside the scene), `target` and `labelAt`. For the simulated screen the target is a named part (`stamp`, `row:bias`, `policy` ...). For a real clip, use absolute screen coordinates: `target: { x: 1290, y: 430 }`, after zoom. Scrub Studio to the frame and read the position off the preview.
- **Zoom:** `zoom: { from, to }` is when the crop onto the panel starts and ends. The crop itself (`ZOOM`, `FOCUS`, `DEST`) is at the top of `src/Scenes.tsx`.

## Trim, speed up, or hide part of a clip

In `script.gmail.clip` and `script.drive.clip`:

```ts
clip: {
  file: 'clips/gmail.mp4',
  startFrom: 45,        // skip the first 45 frames (1.5 s) of the recording
  playbackRate: 1.4,    // 1 = real time, up to 1.5 to speed up a slow recording
  blurRegions: [        // hide an area (screen pixels, frames relative to the scene)
    { x: 1300, y: 12, w: 560, h: 50, from: 0, to: 210 },
  ],
}
```

Each clip scene is 7 s (210 frames), so at `playbackRate: 1` a 12 s recording is cut off at 7 s: raise `playbackRate` or move `startFrom` to the part you want. If your clip's timings differ from the simulated ones, adjust the callout `from`/`to` frames and the `zoom` frames to match.

## Music and voice-over (optional)

Put `music.mp3` and/or `voiceover.mp3` in `public/audio/`. They are used when present (music at 18% volume, voice-over at 100%) and skipped when missing. Change levels in `script.audio`. Restart Studio after adding them.

## Files

- `src/script.ts` copy and timings
- `src/Scenes.tsx` the six scenes
- `src/components/` Scene, Caption, Callout, Cursor, Zoom, ClipOrSimulated, PanelMock (the simulated panel), Screens (simulated browser, email app, file app)
- `src/data/` copies of `demo-results.json` and `policies.json` from `trustlens-lite` (the video is self-contained; re-copy them if the product data changes)
- `public/fonts/` Source Sans 3, loaded from local files. No CDN.

All motion uses `useCurrentFrame` with `interpolate` (ease-out, no overshoot). No CSS transitions or animations.
