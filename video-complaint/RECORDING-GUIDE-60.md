# Recording guide: real clips for the 60 second video

The video renders now with simulated panel screens on top of your Gmail screenshot. Every scene can be swapped for a real recording. Save each clip as `public/clips/<name>.mp4`, then restart `npx remotion studio` (the list of clips is read when Studio or a render starts). A scene with a clip plays the clip instead of the simulation, trimmed or sped up to fill the scene, with the camera keyframes in `src/data/camera.json` still applied. Captions stay on top.

## Safe setup (once)

1. In Chrome, add a **separate profile** (profile icon, Add) used only for recording. Do not use a personal or work profile.
2. Sign in to the **fictional test account only**, before you start recording. Never type a password while recording.
3. `chrome://extensions`: Developer mode on, Load unpacked, pick the `trustlens-lite` folder. In the extension's Settings tick **Demo mode**, set **Organisation profile** to *Harbourview Records Services (complaints)*, set the **Demo Gmail account** to the test address and tick **Enable Gmail reading**. Save.
4. The inbox holds only the fictional test message *Formal complaint: overcharged $11,880 on invoice INV-DEMO-20417 - response required by Friday*. Open the message (not the inbox list).
5. Window: Chrome at **1280 x 800**, zoom 100%, the side panel open on the right (it is about 420 px wide). Turn on Do Not Disturb so no notification slides in.

## QuickTime (every clip)

1. Open QuickTime Player, then **File > New Screen Recording**.
2. Click the small arrow beside the record button: choose **None** for the microphone and leave **Show Mouse Clicks in Recording** off.
3. Choose **Record Selected Portion** and drag a 1280 x 800 box over the Chrome window only.
4. Press Record, do the steps, then press the stop button in the menu bar (or Cmd+Control+Esc).
5. Trim in QuickTime (**Edit > Trim**), then **File > Export As > 1080p**, and name the file as in the table.

## What never to show

Other tabs, bookmarks, the profile menu or avatar menu, any real inbox row or message, notifications, the Mac dock or menu bar, real names or numbers. If any appear, retake. No audio.

## Clips

| File | Scene | Length to record | Steps (then stop) |
|---|---|---|---|
| `s1-gmail-scroll.mp4` | S1, frames 0-299 | 12 s | Test message open, panel closed. Pause 2 s on the subject. Scroll slowly down the body to the three attachment thumbnails. Hover each thumbnail for 1 s. Stop. |
| `s2-panel-open.mp4` | S2, frames 300-449 | 7 s | Message open, panel closed. Move to the TrustLens toolbar icon, pause 1 s, click it. The side panel opens. Stop when the tools list is showing. |
| `s3-consent-review.mp4` | S3, frames 450-649 | 9 s | Panel open at the tools list. Click **Use this email**. (The permission screen in the video is a mock-up: the real extension asks nothing, so record from **Use this email** to the Review screen.) On Review, pause on "Files: 3 read" and the masked count, click **Run AI**, and stop when the four steps have ticked. |
| `s4-checks.mp4` | S4, frames 650-1049 | 16 s | Result screen showing. Pause 3 s on the stamp. Scroll to "Also noted: Bias" and click it (the evidence opens). Click Accuracy's Because line, then **See claims**, and scroll the misinformation and needs-checking claims into view. Stop. |
| `s5-attachments.mp4` | S5, frames 1050-1409 | 14 s | Click the invoice chip to show its **File details** (Created with, Created, Modified, Author, signals, "A clue, not proof."). Then open the correspondence chip or the "Show what the AI will see" box so the [DOB] and [ADDRESS] tags are visible. Stop. |
| `s6-next-step.mp4` | S6, frames 1410-1799 | 15 s | On the result, pause 2 s on the stamp, open the **Because** clause chip (H2.1) and press **Copy citation**. Close it, click **See the path**, and scroll slowly from the top of the timeline to the end. Stop. |

Record about 1 s extra before and after each clip. To trim without re-recording, edit `src/data/clips60.json` (`startFrom` frames to skip, `seconds` of footage to use).

## Check before you use a clip

- Only the fictional test account is visible. Nothing real or personal is on screen.
- The file is H.264 MP4 and plays in QuickTime.
- The first and last second can be cut later; leave them still.
