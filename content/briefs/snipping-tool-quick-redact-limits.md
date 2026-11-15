# Brief: /guides/snipping-tool-quick-redact-limits (guide, wave 1 #6)

## Target queries
- **Primary:** Snipping Tool Quick redact
- **Secondary:** how to redact in Snipping Tool · Snipping Tool redact text · Windows 11 hide sensitive info in screenshot · Snipping Tool text actions redact · does Snipping Tool redact credit card numbers · Snipping Tool remove all redactions

## Search intent
How-to first ("how do I use it?"), then the question nobody answers: **what does it miss?** Windows users who just found the feature.

## SERP snapshot (2026-11-15)
- pureinfotech "How to hide text from screenshots on Snipping Tool for Windows 11" (Mauro Huculak, 15 Sep 2023, updated 7 May 2024, ~650 words). H2s: "Redact text on screenshots…", "Extract text…". Steps: **Text actions** → select → right-click → **Redact text**; **Quick redact**; menu → **Remove all redactions**.
- geekrewind (2 posts), elevenforum tutorial, guidingtech, windowscentral (23H2 what's new), ghacks (Sep 2023 Text Actions), macmyths, nerdschalk, Yahoo tech.
- Some older posts call it "Take Actions" or "Scan text" (version drift). Ctrl+R is cited for Redact text, with one conflicting Ctrl+A.

Missing: what it doesn't detect, where the redaction box comes from, and what happens if you save over the original (the 2023 acropalypse bug).

## Title
- **Recommended:** Snipping Tool Quick Redact: What It Hides (and Misses)
- **Alt 1:** How to Redact in Snipping Tool – and What It Won't Catch
- **Alt 2:** Snipping Tool Redact Text: Emails & Phones Only (Tested)

**Meta description:** Snipping Tool's Quick redact hides emails and phone numbers. We tested what it leaves visible (API keys, card numbers, IBANs) and how to cover the rest.

## H1
Snipping Tool Quick redact: how to use it and what it misses

## Direct answer (40–60 words)
> In Windows 11's Snipping Tool, take a snip, click **Text actions**, then **Quick redact**. According to Microsoft, it hides email addresses and phone numbers. Everything else, including names, card numbers, IBANs, API keys and passwords, stays visible unless you select each item and choose **Redact text**. Check the snip before saving.

## Outline
- **H2: How to use Quick redact (step by step)** Steps with screenshots; state the Snipping Tool version (Settings → About) and Windows build.
- **H2: How to redact other text manually** Select text → right-click → **Redact text** (verify the shortcut on the tested version).
- **H2: What Quick redact misses: our test** One test screenshot with an email, a phone, a Luhn-valid test card, an IBAN, an AWS example key, a GitHub-style token, a JWT, `password=…`, an IP and a name. Table: item × Quick redact × RedactPal. Publish the real results.
- **H2: Is the redaction permanent once saved?** Test: save as PNG → open in another editor → levels/brightness → is the box opaque? Copy-paste vs save. Also check whether **Remove all redactions** works after reopening a saved file (expected no, since it's a flat image; verify).
- **H2: The 2023 "acropalypse" bug: why you save as a new file** BleepingComputer, Mar 2023: overwriting an existing file left the cropped-out data in it; Microsoft patched it (CVE-2023-28303; verify ID and fixed version on MSRC). Habit: save to a new file, or copy-paste.
- **H2: Faster: auto-detect everything in the browser** RedactPal finds keys, cards and IBANs as well; drag once for names (CTA).
- **H2: FAQ**
  - Does Quick redact work offline / is OCR local? (Microsoft: "performed locally on your device")
  - Can I undo a redaction? (before saving: Remove all redactions)
  - Why is Text actions greyed out? (writer: verify the conditions, e.g. language support or no text found)
  - Does Snip & Sketch on Windows 10 have Quick redact? (verify)

## Facts to include (verified)
- Microsoft Support, "Use Snipping Tool to capture screenshots": "select the Text actions button to activate the Optical Character Recognition (OCR) feature"; tools to "Copy all text or to Quick redact any email addresses or phone numbers"; "All text recognition processes are performed locally on your device." https://support.microsoft.com/en-us/windows/use-snipping-tool-to-capture-screenshots-00246869-1843-655f-f220-97299b865f6b
- Pureinfotech: the menu next to Quick redact can limit it to emails or phones; **Remove all redactions** unhides. https://pureinfotech.com/hide-text-screenshots-snipping-tool-windows-11/
- BleepingComputer (Lawrence Abrams, 21 Mar 2023): Snipping Tool overwriting a file "leaves the unused data behind". Partial recovery of the original was demonstrated using David Buchanan's script. https://www.bleepingcomputer.com/news/microsoft/windows-11-snipping-tool-privacy-bug-exposes-cropped-image-content/
- **Verify on MSRC before citing:** CVE-2023-28303 covers Snip & Sketch (Windows 10) and Snipping Tool (Windows 11), CVSS 3.3, fixed Snipping Tool 11.2302.20.0 (per secondary reports). https://msrc.microsoft.com/update-guide/vulnerability/CVE-2023-28303

## RedactPal demo / test to show
The side-by-side detection table above is the core asset. Use the identical test image in both tools and screenshot each result.

## Internal links
`/redact-screenshot` (primary CTA) · `/hide-api-keys-in-screenshots` · `/compare` · `/`

## Target length
1,100–1,400 words.

## What competitors miss
- A test of what Quick redact leaves visible.
- The acropalypse save habit.
- Microsoft's own scope statement (emails and phones only).

## Avoid
- Calling Snipping Tool unsafe. It does what Microsoft says. Our point is coverage.
- Stating version-specific UI names without checking the current build.
