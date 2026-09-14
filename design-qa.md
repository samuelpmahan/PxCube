# NTC shell verification

final result: passed

Source visual: `/Users/samuelmahan/Desktop/Screenshot 2026-09-14 at 1.23.11 PM.png`
(1102 × 1068 pixels). This is the prior launcher Sam asked to extend with an NTC
layer above its sandboxes, not a pixel-identical target. The crop's original CSS
viewport and density are unknown; no font-size equivalence is inferred from it.

Implementation captures: `evidence/ntc-console/reference-width.png` at 1102 ×
1068 CSS pixels / device scale 1; `experience.png` and `mounts.png` at 1440 × 1000;
`mobile.png` at 390 × 844. All are real headless Chrome captures. The source,
reference-width overview, active Experience, and mobile capture were opened
together in one comparison input. The corrected Experience and Mounts captures
were subsequently opened for the focused state review.

Intentional change: cards now sit inside an NTC workspace rather than being the
entire workspace. The sidebar, artifact header, and work/manifest/build strip
remain visible around an active Experience. The original Experience content,
manifest data, and retained frame behavior are reused.

Findings and iteration:

1. P2 — The first active-Experience screenshot briefly labelled its sidebar row
   “Opened · retained.” A two-second status refresh caused the mismatch. Labels
   now update synchronously when changing views. The follow-up browser assertion
   checks “in view” immediately after opening; the recaptured Experience shows
   the correct state. No remaining P0/P1/P2 finding.

Required surfaces:

- Typography: existing system-font approach retained. Hierarchy now separates
  the operator layer, resource title, and embedded Experience. Smaller metadata
  remains readable in the focused screenshots; long manifest values wrap.
- Layout: NTC controls stay outside the iframe; the runtime uses the remaining
  viewport with its own scroll. On narrow screens the sidebar becomes a top
  navigation row. No page-width overflow at 390 pixels; all control views remain
  available. The large source screenshot's two-column card layout intentionally
  becomes a denser resource view to make room for the requested control layer.
- Color: the existing dark/mint palette is retained, with distinguishable shell
  and runtime backgrounds. Build failures have explicit text as well as color.
- Images: no new decorative images or icons are needed for this control layer.
  Existing Experience imagery remains within its original frame.
- Copy: packaged, opened, in-view, retained and unavailable are distinct. The
  header labels its commit as HEAD; the artifact is separately named. No fake
  runtime CPU metrics, process controls or browser build action is presented.

Interaction evidence: `evidence/ntc-console/browser-results.json` compares
visible work/manifest/build inspectors with the actual embedded snapshot, and
compares owner inspection with the same live owning object used by the frame.
An identity witness and saved draft survive every control-view switch. Mounts
come from the owner API, test iterations are visible, Escape closes the
inspector, and a newer-build offer preserves the loaded artifact and context.
The same test also passes in the isolated fixture mode configured for CI.
Console errors: none in those runs.

No additional visual assets or region crops were needed: the full captures and
focused Experience/Mounts captures make the controls and their state readable.

Remaining scope: this is the NTC inspection and context-management surface.
Build execution is still invoked through the shared Node program. Hidden frames
are retained, not paused. These limits are documented in `docs/ntc-console.md`.
