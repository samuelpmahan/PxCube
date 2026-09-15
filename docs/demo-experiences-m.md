# Three minimal Experience candidates

Sam's scope, 2026-09-14: BuildBag, CreateGraphics, ExportGraphics. Muse owns tooling.
Upload's original m and the accepted shopping Shelf remain their existing surfaces.
These are review candidates, not human acceptance or promotion.

## Visible review

- BuildBag: select exact copies from a deterministic specimen shelf, arrange the
  selection, name/create a Bag, reopen it after reload. Mold/manufacturer first;
  plastic then weight descending. Nicknames are recognition only, never searched.
- CreateGraphics: choose a specimen, Spotlight design, colors and frame; keep
  a rendered graphic. Uses Studio's existing card cascade and renderer.
- ExportGraphics: inspect a kept graphic, download its exact SVG or a PNG at its
  captured dimensions. Retain the actual byte count/hash and failures. A download
  request is not proof that the user saved the file.

Each owns mock.<experience> (interactive) or mock.<experience>.<iterator> (test).
An explicit “Keep for ExportGraphics” offers an immutable capture; ExportGraphics
imports it into its own store. No live store, test fixture, or uploaded photo is
silently shared. Starter examples are identified as seeded demo material.

## Parts and Calculations before implementation

Reuse the pinned Studio store, Part, compose, archive/restore, fn.read,
fn.shelfRows, fn.createBag and fn.addReference. Bag members retain physical ids
and exact version addresses. The UI's unfinished selection is a separate Part.

New local material lives under ds.px.studio.demo.* (public mounted px.studio.demo.*,
using the existing legacy mount adapter). Named design, selection, field projection,
card, frame, scene, graphic, capture and export-result Parts are distinct values.
Inputs retain the actual source Part links. No new kernel or executor.

The graphic composition binds disc + resolved mold + retained art, then existing
cardsEffective → cardsApply → composeCard; composeFrame + composeOverlay →
materializeOverlay produces the same SVG used by preview and export. The new
field adapter maps the pinned specimen representation into those existing bindings.
Designs contain bindings; captures retain exact rendered material.

Filesystem packaging, browser PNG conversion, hashing and download are explicit
effects. Existing pngFromSvg and sha256 implementations supply bytes/hashes.
Per-export success/failure material is retained; pure replays do not repeat downloads.

## Deliberate boundaries

- This candidate starts with DiscSpotlight; Competition is a next variation.
- The imported fn.createBag rejects an empty selection. That is today's limitation,
  not a universal rule; the older Experience contract allows an empty Bag.
- No ManageBags implementation, kernel migration, new build system or automatic promotion.
- Separate sandbox seeds do not claim to be the user's full accepted 50-disc shelf.
- Retained source code and import hashes travel in-repo; no sibling checkout is
  needed by a fresh clone to build these Experiences.

## Browser finding

The first browser run hit localStorage's quota opening a numbered test. The
existing archive held about 992 KB for eight seeded specimens; redundant query
projections grew it further. A failed open also exposed an owner/model mismatch.

The consumer now reuses an unchanged shelf projection and rendered result, swaps
the active owner only after successful opening, and gzip-encodes the **complete
existing archive** with the browser's CompressionStream. No Part is omitted.
Byte round-trip and the existing composition replay remain the tests of sameness.
This is a storage encoding adapter, not a new archive schema or core migration.
Commit is awaited before the UI claims a save; failed writes preserve stored bytes.

PNG conversion and download still use the existing browser effect functions,
outside the pure replay chain. Their measured outcomes enter named Parts and a
pure record Calculation bound to the capture. Restoring an archive verifies that
composition; it does not repeat a download or claim to replay the browser effect.
