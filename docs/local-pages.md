# Local PxCube: the same packaging program, one local command

Candidate branch: `codex/local-pages`, based on Muse's `d1de6847` snapshot.
Node 24; no package installation or global hooks needed.

```sh
node local/run.mjs dev
```

Open `http://127.0.0.1:4321/`. The launcher contains Hello and MockPxC. Select
MockPxC, edit one bag name, and choose New iteration. The first world keeps its
value; the new one starts from the same shelf seed. Run visible isolation check
operates the actual Save control and compares the two worlds with earlier runs.
Expand the inspection panel or use `window.pxCubeMocks` in that frame's console.

The Work board link is actual neat HTML. Build record contains crisp source and
manifest hashes, output hashes, shared tool hashes and the checked ledger hashes.
Source edits rebuild; a New build ready button offers a reload without interrupting
a person editing a world. Failed apps remain visible beside working ones.

## Roles and current additions

- **neat**: actual vendored standalone CLI validates WorkItems and renders its
  board from a retained ledger snapshot. Packaging does not create human
  acceptance or promotion references. The WorkItem `pcr.pxcube.<id>` target is
  a named work target; this adapter is not claiming a new executable PQL PCR.
- **tidy**: actual vendored CLI checks its lineage manifest. This adapter adds
  `.tidy/pxcube.json` as a PxCube-specific registration file. The local adapter,
  not the upstream tidy CLI, interprets those app snapshots and tracks. This is
  an integration candidate for Muse, not a claim that tidy already had this API.
- **crisp**: Muse's `packageApp` performs manifest, declared-mount, source-hash,
  prefix-lint and build/output checks. The adapter executes that code on fresh
  source copies and retains each `.crisp` receipt. It adds index.html presence,
  unchanged source after build, and actual output-byte hashes.
- **launcher**: the same generator assembles the same static apps for both
  `dev` and `local/ci.mjs`. The local HTTP server only serves those files. The
  workflow now calls the shared program, preserving a red job for a failed app
  while permitting healthy sibling artifacts to deploy. This branch has not
  been pushed or run by GitHub Actions; local verification is not a CI claim.

First discovery registers an app as Exp. A manifest's `track: clean` cannot
promote itself. Source or shared packaging-tool changes surface as registration
drift, and drifted Clean registrations are displayed in Exp. `node local/run.mjs
register` explicitly refreshes all discovered registrations and returns them to
Exp. It is not promotion. No automatic garbage collection or deletion of old
attempts is enabled.

`.pxcube/runs/<attempt>` retains exact tool/app source snapshots, crisp receipts,
failures, ledger snapshots, logs and the final site. `.pxcube/latest.json` is only
a pointer. Runs and generated images stay local and are ignored by Git.
Packaging shell commands execute trusted repository builds; iframe tokens do not
sandbox the build process. This first adapter accepts only a single top-level
outDir: the pre-hardening crisp hasher excludes directory names, not nested paths.

## Logical seed versus allocated mount

`experience.json` declares the logical seed `shelf`. The app's reference
`shelf.px.discs` is checked by crisp. At runtime the owner binds that seed to
`mock.<id>.<iterator>`, e.g. `mock.shelf.2.px.discs`. This is an allocated instance,
not a dotted manifest mount sneaked past the current single-name grammar.

`local/mock-mounts.mjs` clones the exported MockPxC seed and routes a handle's
qualified reads only inside that handle. Stored inner addresses remain `px`,
`fn`, `oc`, or `sc`; the mock's write operation replaces a whole `sc.<name>`
value and records before/after material. `resolveWorldValue` is one small
extraction from Muse's resolver, so owned instances use the same longest-dotted-key
rule as the original fixtures. The original fixture worlds remain unchanged.

The smoke app retains JSON worlds, seed snapshots, seed source identity, and
write history in localStorage. Back/reopen and page reload restore those values;
a new iterator never overwrites its predecessor. Storage quota failure leaves
previous state intact. A second owner with stale storage is refused, rather than
silently overwriting another owner's updates. There is no automatic space policy.
This demo opts into a trusted same-origin frame to use browser storage. These
handles separate application state; they are not hostile-code security boundaries.

MockPxC still returns plain fixture values, including static `fn` samples. Its
write history is a mock change log, not a P&C Calculation receipt. It does not
implement Studio's Part wrappers, composition or effects interfaces. JSON retention
here is not preservation of cross-realm JavaScript object identity.

## Checks and evidence

```sh
node --test local/test/*.test.mjs
node local/ci.mjs
```

The six crisp fixtures are used directly by the adapter tests. `leaky`, `drift`
and `unknown-world` in d1de6847 are copies of hello, so the tests visibly add the
specific bad prefix, source change, or missing world before invoking the real
CLI. They are not represented as negative fixtures that already failed unchanged.
The existing `crisp/test/helpers.mjs` computes a doubled crisp/bin path; these
checks call the actual CLI path without changing Muse's in-progress suite.

`evidence/local-pages/` records the test output, browser checks and verified source
hashes. The browser check serves the exact artifact under both a local root and a
Pages-style `/PxCube/` prefix without special CORS headers. It tests the actual
controls, mount values, retained iterations, frame closure and full page reload.
It is repeatable with Playwright plus Chromium; set PLAYWRIGHT_MODULE and CHROME_BIN
only when using a preinstalled runtime outside this repo. No browser is launched
by the ordinary dev command.
