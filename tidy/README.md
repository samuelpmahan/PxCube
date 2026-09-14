# Manifests for crisp

This is the local Node manifest-provider extension to tidy. The original
standalone tidy executable remains pinned, unchanged, in `vendor/tidy/`.

`.tidy/manifest.json` owns the definitions. An optional `experience` object on a
type supplies the build command, output directory, mounts and scaffold settings.
The type's `root` supplies its destination and id; `version` supplies its version.
No promotion or version-freezing policy is added here.

`provideExperience(repo, type)` returns a detached manifest and a digest of its
type definition. `node tidy/manifest.mjs pxcube-build-bag` prints exactly this
input for inspection. The provider currently targets `experiences/<id>`, matching
the existing PxCube discovery path.

Crisp consumes the provider during generation **and every package build**. The
generated `experience.json` is only a reference to the tidy type. Updating labels
or the build definition in tidy affects the next build without regenerating any
authored code. The package receipt retains the actual manifest input digest.

This extension is local work, not a claim that the pinned upstream tidy already
implemented this API. Its unit and CLI-through-launcher coverage is in
`local/test/scaffold.test.mjs`; browser E2E is in `local/test/scaffold-browser.mjs`.
