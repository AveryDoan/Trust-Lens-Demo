# TrustLens Lite: SPEC

Source of truth for the hackathon demo. If code and this file disagree, this file wins. No code exists yet.

## 1. Purpose

A Chrome Manifest V3 extension. The user selects text on any web page, and a side panel assesses it for **bias, accuracy, deception risk and information governance**, then recommends **one action**. Keep everything small.

Wording rule: results are **signals, not proof**. The panel always shows "A person makes the final call." Use hedged language ("may", "appears", "signals of"). Never say "this is false" or "this is a scam".

## 2. Constraints

- No backend. No build step. Plain JavaScript ES modules, loaded directly by Chrome.
- Manifest V3, side panel API.
- One hosted LLM call per assessment. The API key is entered once in the side panel settings and kept in `chrome.storage.local`.
- Out of scope: see section 9.

## 3. Trigger and input

1. Right-click context menu item **"Check with TrustLens"** (on selection), or the toolbar button.
2. If there is a selection, use it. If there is none, use the page's main text (`<article>`, then `<main>`, then `document.body.innerText`).
3. Cap input at 8,000 characters. If truncated, the panel says so.
4. The side panel opens and shows a loading state, then the report.

## 4. Pipeline

### Step 1: Local privacy scan (before anything leaves the browser)

Regex masking, run in the extension. Replace matches with typed placeholders:

| Type | Placeholder |
|---|---|
| Email address | `[EMAIL]` |
| Phone number | `[PHONE]` |
| Tax file number (9 digits, optionally spaced `123 456 782`) | `[TFN]` |
| Card number (13 to 19 digits, spaces or dashes allowed, Luhn-valid) | `[CARD]` |

The scan returns `{ maskedText, counts: { email, phone, tfn, card } }`. Only `maskedText` is sent to the model. The panel tells the user what was masked and how many.

### Step 2: One LLM call

- Input: masked text plus the bundled policy pack (`policy-pack.json`, a short list of rules for classification, retention and AI-tool use, shipped with the extension).
- The system prompt instructs the model to return **only** one JSON object matching section 5, to copy evidence quotes exactly from the text, and to use hedged wording.
- Output is parsed and validated against the schema. On invalid JSON, retry once, then show an error. No partial reports.
- Evidence check in code: any quote that is not an exact substring of the masked text is dropped. If a check ends with no quotes, its confidence is capped at `low`.

### Step 3: Overall action (code, not the model)

A pure function `decideAction(report, scanCounts)` returns exactly one action. The model never picks it. Rules apply **in order, first match wins**. A `Concern` with `low` confidence is treated as `Check`.

| # | Action | Condition |
|---|---|---|
| 1 | `escalate` | `deception.status = Concern` with confidence `high`, OR two or more checks are `Concern` with confidence `high` |
| 2 | `redact` | Scan masked anything (any count above 0), OR `governance.pii_types` is non-empty |
| 3 | `restrict sharing` | `governance.classification` is `confidential` or `restricted`, OR `governance.ai_tool_use.allowed` is `false` |
| 4 | `revise` | `bias.status` or `accuracy.status` is `Concern` (at medium or high confidence) |
| 5 | `verify` | Any check is `Check`, or any `Concern` at low confidence |
| 6 | `approve` | Everything else (all checks `OK`) |

The panel shows the action with a one-line reason built from the rule that matched.

## 5. Report JSON schema

The exact shape the model must return (JSON Schema, draft 2020-12). `overall_action` is **not** in the model output; code adds it afterwards (section 6).

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TrustLensReport",
  "type": "object",
  "additionalProperties": false,
  "required": ["bias", "accuracy", "deception", "governance"],
  "$defs": {
    "status": { "enum": ["OK", "Check", "Concern"] },
    "confidence": { "enum": ["low", "medium", "high"] },
    "check": {
      "type": "object",
      "additionalProperties": false,
      "required": ["status", "confidence", "summary", "evidence", "next_step"],
      "properties": {
        "status": { "$ref": "#/$defs/status" },
        "confidence": { "$ref": "#/$defs/confidence" },
        "summary": { "type": "string", "minLength": 1, "maxLength": 300 },
        "evidence": {
          "type": "array",
          "maxItems": 3,
          "items": { "type": "string", "minLength": 1, "maxLength": 300 }
        },
        "next_step": { "type": "string", "minLength": 1, "maxLength": 200 }
      }
    }
  },
  "properties": {
    "bias": { "$ref": "#/$defs/check" },
    "accuracy": { "$ref": "#/$defs/check" },
    "deception": { "$ref": "#/$defs/check" },
    "governance": {
      "allOf": [
        { "$ref": "#/$defs/check" },
        {
          "type": "object",
          "required": ["classification", "pii_types", "retention", "ai_tool_use"],
          "properties": {
            "classification": { "enum": ["public", "internal", "confidential", "restricted"] },
            "pii_types": {
              "type": "array",
              "items": {
                "enum": ["name", "email", "phone", "address", "tax_file_number", "card_number", "health", "other"]
              }
            },
            "retention": { "type": "string", "maxLength": 200 },
            "ai_tool_use": {
              "type": "object",
              "additionalProperties": false,
              "required": ["allowed", "reason"],
              "properties": {
                "allowed": { "type": "boolean" },
                "reason": { "type": "string", "maxLength": 200 }
              }
            }
          }
        }
      ],
      "unevaluatedProperties": false
    }
  }
}
```

Field rules:

- `evidence`: quotes copied **exactly** from the masked text. Empty array allowed only when `status` is `OK`.
- `summary`: one plain-English sentence, hedged.
- `next_step`: one short, concrete thing the reader could do.
- `retention`: taken from the policy pack, for example "Keep 12 months, then review."

## 6. Final report object (what the panel renders)

The validated model output plus:

```json
{
  "overall_action": "approve | verify | revise | restrict sharing | redact | escalate",
  "action_reason": "string, from the matched rule",
  "privacy_scan": { "email": 0, "phone": 0, "tfn": 0, "card": 0 },
  "truncated": false
}
```

## 7. The six overall actions

1. `approve`: no signals found; fine to use as is.
2. `verify`: check the claims or sources before relying on it.
3. `revise`: rewrite for balance or accuracy before using or sharing.
4. `restrict sharing`: keep to the intended audience; do not paste into AI tools or share widely.
5. `redact`: remove or mask personal data before using or sharing.
6. `escalate`: pass to a responsible person (manager, security, compliance) for review.

## 8. Panel layout

Top: overall action badge and reason. Then four check cards (bias, accuracy, deception, governance) each showing status chip, confidence, summary, quotes and next step. Governance card also shows classification, PII types, retention and AI-tool verdict. Then privacy scan counts. Footer: "Signals, not proof. A person makes the final call."

Status colours must also have text labels (not colour-only).

## 9. Out of scope

- Outlook or Teams add-ins
- Sign-in or user accounts
- Browsers other than Chrome
- File uploads (PDF, Word and so on)
- Any backend, database or server
- Build tooling, bundlers, TypeScript
- History or saving past reports

## 10. Proposed file layout (for the build step)

```
manifest.json
background.js        context menu, toolbar click, opens side panel
content.js           reads selection or main text
sidepanel.html
sidepanel.js         UI and orchestration
privacy.js           regex scan and masking
llm.js               prompt, API call, schema validation, evidence check
decide.js            decideAction()
policy-pack.json
```

## 11. Acceptance checklist

- [ ] SPEC.md contains the schema, the six actions, the out-of-scope list and this checklist.
- [ ] Extension loads unpacked in Chrome with no errors; Manifest V3.
- [ ] No build step; all code is plain JS modules.
- [ ] Right-click "Check with TrustLens" on a selection opens the side panel with a report.
- [ ] Toolbar button with a selection uses the selection.
- [ ] Toolbar button with no selection uses the page's main text.
- [ ] Input over 8,000 characters is truncated and the panel says so.
- [ ] Emails, phone numbers, TFNs and card numbers are masked before the network request (verified in DevTools Network tab: the request body has no raw values).
- [ ] Card masking only applies to Luhn-valid numbers.
- [ ] Exactly one LLM request per assessment.
- [ ] Invalid model JSON is retried once, then shows a clear error.
- [ ] Every evidence quote shown is an exact substring of the masked text; others are dropped.
- [ ] Each of bias, accuracy, deception and governance shows status, confidence, summary, evidence and next step.
- [ ] Governance also shows classification, PII types, retention and AI-tool permission.
- [ ] `overall_action` is computed by `decideAction()` in code; the prompt does not ask the model for it.
- [ ] A unit-style test page or script covers one example for each of the six actions.
- [ ] Wording is hedged everywhere; "Signals, not proof. A person makes the final call." is visible.
- [ ] Status is not conveyed by colour alone.
- [ ] Nothing from the out-of-scope list has been built.
