# Vendored effect-rstest

This package is the published `effect-rstest` 0.1.0 artifact from
`https://pkg.pr.new/ScriptedAlchemy/effect-rstest@79abbf684c7b150ee5f32694129a7caf969903bc`.
The upstream artifact is MIT licensed (see `LICENSE`). Its source, ESM output,
and declarations are retained here. The package manifest keeps its original
runtime exports and peers, but drops upstream build-only scripts and dev
dependencies because this workspace consumes the prebuilt artifact.

The repository's former `patches/effect-rstest@0.1.0.patch` has been applied to
`src/internal/internal.ts` and `dist/index.mjs` without other behavioral changes.
The copied source and README were formatted with the workspace formatter.
The workspace package replaces a pkg.pr.new URL dependency because pnpm 12.4.2
does not apply `patchedDependencies` to that URL resolution. Keep source and
published output in sync when changing this package.
