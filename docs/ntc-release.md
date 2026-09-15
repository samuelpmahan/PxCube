# NTC release path

`neat` owns reviewable work, `tidy` resolves the manifests, and `crisp`
produces/validates the immutable receipt. `local/run.mjs` is the one assembly
program used by local preview and Pages CI; GitHub Actions only distributes
the package legs and invokes that assembler with their staged receipts.

## Delta packages, complete Pages

The Page cannot deploy a partial shelf: every Experience needs a verified
receipt in every assembled artifact. We therefore cache packages rather than
shipping partial output.

`local/affected-targets.mjs` is the shared dependency graph:

- an Experience's own source always keys its package;
- `crisp` and `mock-pxc` key every package;
- a typed manifest provider keys only its typed Experiences;
- Studio's importer keys Upload, Explore, Your Shelf, Build Bag, and On
  Course; the Studio-demo renderer additionally keys Build Bag and On Course;
- a composed base propagates to its overlays.

For a normal push, Actions prints the affected set, restores each exact
package key, recompiles only cache misses, verifies every restored/new receipt,
then stages the complete shelf. A cache eviction is safe: it merely causes an
honest rebuild. Local builds use the same keys under `.pxcube/package-cache/`.
Launcher-only and documentation changes reassemble the Page without invalidating
Experience packages.

Useful commands:

```sh
node local/affected-targets.mjs --base HEAD~1 --head HEAD
node local/affected-targets.mjs --base HEAD~1 --head HEAD --matrix
node local/run.mjs build
```

The target graph is intentionally conservative. Add a dependency category
before a builder starts reading a new shared directory; cache reuse must never
be guessed.
