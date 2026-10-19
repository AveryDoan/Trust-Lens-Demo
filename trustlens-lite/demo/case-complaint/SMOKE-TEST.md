# Smoke test: real Chrome, about 10 minutes

Use the **fictional test account only**. Never type a real password into anything here. All data is made up.

## A. Set up

1. Open Chrome with a **separate profile** (Profile menu, Add). Go to `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked**, pick the `trustlens-lite` folder. After any code change press the reload arrow on the extension card.
2. Open the extension's **Settings** (the sliders icon in the panel header, or the card's Details, Extension options).
3. Tick **Demo mode**. Set **Organisation profile** to *Harbourview Records Services (complaints)*. Save.
4. Check the card shows no red **Errors** button.

## B. Drop path (works without Gmail)

1. Open any web page. Click the TrustLens toolbar icon to open the side panel.
2. Drop the three PDFs from `demo/case-complaint/` onto the panel together: the invoice (`INV-DEMO-20417.pdf`), `02-service-agreement-HRS-AGR-0311.pdf` and `Correspondence-thread.pdf`.
3. Expected: **Review before AI**. Three files with chips *Invoice*, *Agreement*, *Emails*; a line such as "N items masked locally" with counts by type; the text box shows tags like `[EMAIL]`, `[PHONE]`, `[DOB]`, `[ADDRESS]` and no raw personal details; the notice "Demo mode: no call is made."
4. Press **Run AI**. Expected: four progress steps over about 3 seconds, then Level 1 with:
   - the stamp **Approve $11,880.00 refund and corrected invoice**, reason "Invoice is $11,880.00 above the signed agreement.", owner Billing Manager and Finance Director, due Fri 23 Oct;
   - **Then** with three steps (acknowledge, notify the Privacy Officer, refer to the Complaints Manager), each due Tue 20 Oct;
   - rows Accuracy, Misleading, Governance (all Concern) and the line "No concerns: Bias";
   - a **Provenance: check** chip if a file raises a signal;
   - one footer line, "Policy basis: Harbourview complaints procedure".
5. Open **Accuracy**: a table (Item, Agreed, Billed, Difference) with +$11,880.00 on the total row, then the claims list ("This is fraud" shows *Not shown in the documents*).
6. Open **Misleading**: two or three quotes. Open **Governance**: what was found, clause links, steps.
7. Click a clause link (for example `H4.1`). A sheet shows the verbatim clause. Press **Copy citation** and paste somewhere: it should read "Recommended action: ... Basis: ... Checked with TrustLens Lite on ...; a person makes the final decision."
8. Click the **Provenance: check** chip (or a document chip): *File details* with Created with, Created, Modified, Author, and "Metadata can be changed or removed. It is a clue, not proof."

## C. Gmail path (demo account only)

1. In Settings set **Demo Gmail account** to the test address and tick **Enable Gmail reading**. Save. (It is off by default.)
2. In the same Chrome profile, sign in to Gmail **as that test account only** and open the test message *Formal complaint: overcharged $11,880 on invoice INV-DEMO-20417 - response required by Friday*.
3. Open the side panel. Expected: a **Use this email** button. Nothing is read before you press it.
4. Press **Use this email**. Expected: **Review before AI** listing exactly the files read, with roles. For the test message (invoice, the procedure PDF, the correspondence thread) that is: *Email*, *Invoice*, *Policy* (the procedure PDF is a policy, never the agreement) and *Emails*. A file that could not be downloaded shows **Not read** with a **Drop file** button: drop the downloaded PDF onto it.
5. Press **Run AI**. Expected: the saved case, plus the visible note **Agreement not attached: amounts checked against the email only.** In Accuracy the agreed-side quotes read "Not verified from a document".
6. Safety checks: untick **Enable Gmail reading** (or change the address) and press **Use this email** again. Expected: "Gmail reading is off for this account. Use a demo account." and nothing is read.
7. If something fails, open Settings, Advanced, **Gmail diagnostics** with the Gmail tab open, and paste the output back. It lists strategies and yes/no flags only, no message text.

## D. Profile switch

1. In Settings switch the profile to *RIMPA Global (governance documents)*, save, reopen the panel. The footer reads "Policy basis: RIMPA Global published governance documents".
2. Switch back to Harbourview: the footer returns to "Harbourview complaints procedure (fictional demo)".

## E. Earlier demos (profile RIMPA Global, Demo mode on)

Paste or drop each and check the stamp:

| Input | Stamp |
|---|---|
| Email A text (`demo/emails/a.txt`) | Do not distribute until reviewed (escalate) |
| Email B text (`demo/emails/b.txt`) | Verify the source first (verify) |
| Email C text (`demo/emails/c.txt`) | OK to use (approve) |
| `demo/docs/01-case-note.md` or its PDF | escalate |
| `demo/docs/02-election-flyer.md` | verify |
| `demo/docs/03-governance-update.md` | approve |
| `demo/docs/04-ai-briefing.md` | Revise before using (revise) |

## F. Stop and fix

| Symptom | Do this |
|---|---|
| The panel does not open or a button is dead | `chrome://extensions`, press reload on the card, close and reopen the panel. Look for an **Errors** button on the card and read it. |
| Old behaviour after a code change | Reload the extension. Hard-reload the Gmail tab. Saved results are read from the extension's files each run, so there is nothing to clear except Settings (re-save them). |
| No result for the three PDFs in Demo mode | Check **Demo mode** is ticked in Settings. The files must contain both `INV-DEMO-20417` and `HRS-AGR-0311`. Roles come from the text, not the file names. Scanned PDFs have no text and are refused with a clear message. |
| The footer or citations look wrong | Settings, **Organisation profile**. The saved case uses the Harbourview pack; the earlier demos use RIMPA Global. |
| *Use this email* says "Gmail reading is off for this account" | The toggle is off, the address is empty, or the signed-in account differs from the address in Settings. Check spelling and sign-in. |
| *Use this email* falls back to selected text | The reader did not find an open message. Open the message, not the inbox list. Run **Gmail diagnostics**. |
| Attachments show **Not read** | Gmail may not expose a download link, or the download was refused. Download the PDFs and drop them on the chip, or on the panel. |
| Everything is empty after dropping files | The file type must be PDF, Word, text or Markdown, under 5 MB, with real text. |
