#!/usr/bin/env node
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { NodeServices } from '@effect/platform-node';
import { CLOUDFLARE_WORKER_NODE_BUILTINS } from '@modern-js/app-tools-extensions/cloudflare-output-contract';
import { resolveUltramodernReleaseIdentity } from '@modern-js/app-tools-extensions/release-identity';
import { generateEffectWorkerRuntimeWrapper } from '@modern-js/plugin-bff-extensions/effect-source-loader';
import { Effect, Exit, FileSystem, ManagedRuntime, Schema } from 'effect';
import { Command, Flag } from 'effect/unstable/cli';
import { build } from 'esbuild';
import type { Plugin } from 'esbuild';

const UnitIdSchema = Schema.String.pipe(Schema.brand('UnitId'));
const BuildArtifactTextSchema = Schema.fromJsonString(
  Schema.Struct({
    deliveryUnit: Schema.Struct({ buildMarker: Schema.String, unitId: UnitIdSchema }),
  }),
);
const JsonStringSchema = Schema.fromJsonString(Schema.String);
const decodeBuildArtifactText = Schema.decodeUnknownEffect(BuildArtifactTextSchema);
const encodeJsonString = Schema.encodeEffect(JsonStringSchema);
const API_ONLY_WORKER_NODE_BUILTINS = [
  ...CLOUDFLARE_WORKER_NODE_BUILTINS,
  'console',
  'diagnostics_channel',
  'perf_hooks',
  'querystring',
] as const;
const workerBuiltins = new Set<string>(API_ONLY_WORKER_NODE_BUILTINS);
const verticalPattern = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const apiPrefixPattern = /^\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*-api$/u;
const effectBffRuntimeEntry = 'effect-bff-runtime-entry';
const optionalNativeDependencyNamespace = 'optional-native-dependency';
const postgresProtocolCommonJsEntry = fileURLToPath(
  new URL('../pg-protocol/dist/index.js', import.meta.resolve('pg/package.json')),
);
const postgresPoolCommonJsEntry = createRequire(import.meta.resolve('pg/package.json')).resolve('pg-pool');

// eslint-disable-next-line eslint/require-unicode-regexp -- esbuild's Go-compatible filter engine does not support JavaScript's Unicode flag; expires: 2027-09-13.
const effectBffRuntimeEntryPattern = /^effect-bff-runtime-entry$/;
// eslint-disable-next-line eslint/require-unicode-regexp -- esbuild's Go-compatible filter engine does not support JavaScript's Unicode flag; expires: 2027-09-13.
const everyModulePattern = /.*/;
// eslint-disable-next-line eslint/require-unicode-regexp -- esbuild's Go-compatible filter engine does not support JavaScript's Unicode flag; expires: 2027-09-13.
const workerBuiltinPattern = /^[a-z][a-z0-9_/]*$/;
// eslint-disable-next-line eslint/require-unicode-regexp -- esbuild's Go-compatible filter engine does not support JavaScript's Unicode flag; expires: 2027-09-13.
const effectBffRuntimeSourcePattern = /\?modern-bff-runtime-source$/;
// eslint-disable-next-line eslint/require-unicode-regexp -- esbuild's Go-compatible filter engine does not support JavaScript's Unicode flag; expires: 2027-09-13.
const optionalNodeRsXxhashPattern = /^@node-rs\/xxhash$/;
const runtime = ManagedRuntime.make(NodeServices.layer);

const ignoreDependency = (_dependency: string): void => {
  // esbuild tracks the wrapper's imported dependencies itself.
};

const makeEffectBffRuntimePlugin = (input: {
  readonly appDirectory: string;
  readonly readSource: (sourcePath: string) => Effect.Effect<string, unknown>;
  readonly runtimeQuery: string;
  readonly wrapper: string;
}): Plugin => ({
  name: effectBffRuntimeEntry,
  setup(buildApi) {
    buildApi.onResolve({ filter: effectBffRuntimeEntryPattern }, () => ({
      namespace: 'effect-bff-wrapper',
      path: effectBffRuntimeEntry,
    }));
    buildApi.onLoad({ filter: everyModulePattern, namespace: 'effect-bff-wrapper' }, () => ({
      contents: input.wrapper,
      loader: 'js',
      resolveDir: input.appDirectory,
    }));
    buildApi.onResolve({ filter: workerBuiltinPattern }, (args) =>
      workerBuiltins.has(args.path) ? { external: true, path: `node:${args.path}` } : undefined,
    );
    buildApi.onResolve({ filter: effectBffRuntimeSourcePattern }, (args) => ({
      namespace: 'effect-bff-source',
      path: args.path.slice(0, -input.runtimeQuery.length),
    }));
    buildApi.onResolve({ filter: optionalNodeRsXxhashPattern }, (args) => ({
      namespace: optionalNativeDependencyNamespace,
      path: args.path,
    }));
    buildApi.onLoad({ filter: everyModulePattern, namespace: optionalNativeDependencyNamespace }, () => ({
      contents: 'export const xxh3 = undefined;',
      loader: 'js',
    }));
    // eslint-disable-next-line effect-native/no-async-script-program -- esbuild requires this Promise callback adapter; the managed runtime preserves the Effect services and typed source-read program at that edge; expires: 2027-09-13.
    buildApi.onLoad({ filter: everyModulePattern, namespace: 'effect-bff-source' }, async (args) => ({
      contents: await runtime.runPromise(input.readSource(args.path)),
      loader: 'ts',
      resolveDir: path.dirname(args.path),
    }));
  },
});

class ApiOnlyWorkerBuildError extends Schema.TaggedError<ApiOnlyWorkerBuildError>()('ApiOnlyWorkerBuildError', {
  cause: Schema.optional(Schema.Defect()),
  message: Schema.String,
}) {}

const failure = (message: string, cause?: unknown) => new ApiOnlyWorkerBuildError({ cause, message });

export const buildApiOnlyCloudflareWorker = (input: {
  readonly prefix: string;
  readonly vertical: string;
  readonly workspaceRoot?: string;
}) =>
  Effect.gen(function* buildApiOnlyCloudflareWorkerEffect() {
    if (!verticalPattern.test(input.vertical)) {
      return yield* Effect.fail(failure('Vertical must be a canonical slug.'));
    }
    if (!apiPrefixPattern.test(input.prefix)) {
      return yield* Effect.fail(failure('API prefix must be a canonical absolute API path.'));
    }

    const fileSystem = yield* FileSystem.FileSystem;
    const workspaceRoot = path.resolve(input.workspaceRoot ?? path.join(import.meta.dirname, '..'));
    const appDirectory = path.join(workspaceRoot, 'verticals', input.vertical);
    const resourcePath = path.join(appDirectory, 'api', 'index.ts');
    const outputDirectory = path.join(appDirectory, 'dist-cloudflare', 'worker');
    const buildFailureMessage = `Unable to build the ${input.vertical} API-only Cloudflare worker.`;
    const mapBuildFailure = (cause: unknown) => failure(buildFailureMessage, cause);
    const buildArtifactSource = yield* fileSystem
      .readFileString(path.join(appDirectory, 'shared', 'ultramodern-build.json'), 'utf-8')
      .pipe(Effect.mapError(mapBuildFailure));
    const buildArtifact = yield* decodeBuildArtifactText(buildArtifactSource).pipe(Effect.mapError(mapBuildFailure));
    const identity = yield* Effect.try({
      catch: mapBuildFailure,
      try: () =>
        resolveUltramodernReleaseIdentity({
          generationBuildMarker: buildArtifact.deliveryUnit.buildMarker,
          unitId: buildArtifact.deliveryUnit.unitId,
          workspaceRoot,
        }),
    });
    const runtimeQuery = '?modern-bff-runtime-source';
    const wrapper = yield* Effect.tryPromise({
      catch: mapBuildFailure,
      try: async () =>
        await generateEffectWorkerRuntimeWrapper(
          { addDependency: ignoreDependency },
          { appDir: appDirectory, prefix: input.prefix },
          resourcePath,
        ),
    });
    const [buildMarker, sourceRevision] = yield* Effect.all([
      encodeJsonString(identity.buildMarker),
      encodeJsonString(identity.sourceRevision),
    ]).pipe(Effect.mapError(mapBuildFailure));
    yield* fileSystem.makeDirectory(outputDirectory, { recursive: true }).pipe(Effect.mapError(mapBuildFailure));
    const readSource = (sourcePath: string) => fileSystem.readFileString(sourcePath, 'utf-8');

    yield* Effect.tryPromise({
      catch: mapBuildFailure,
      try: async () =>
        await build({
          absWorkingDir: appDirectory,
          alias: {
            'pg-pool': postgresPoolCommonJsEntry,
            'pg-protocol': postgresProtocolCommonJsEntry,
          },
          bundle: true,
          banner: { js: 'const require = process.getBuiltinModule;' },
          conditions: ['workerd', 'worker', 'browser', 'import', 'module', 'default'],
          define: {
            ULTRAMODERN_BUILD_MARKER: buildMarker,
            ULTRAMODERN_SOURCE_REVISION: sourceRevision,
          },
          entryNames: '[name]',
          entryPoints: { __modern_bff_effect: effectBffRuntimeEntry },
          external: API_ONLY_WORKER_NODE_BUILTINS.flatMap((name) => [name, `node:${name}`]),
          format: 'esm',
          legalComments: 'none',
          logLevel: 'info',
          mainFields: ['browser', 'module', 'main'],
          minify: true,
          outdir: outputDirectory,
          platform: 'neutral',
          plugins: [makeEffectBffRuntimePlugin({ appDirectory, readSource, runtimeQuery, wrapper })],
          sourcemap: false,
          target: 'es2024',
        }),
    });

    return path.join(outputDirectory, '__modern_bff_effect.js');
  });

const cli = Command.make(
  'build-api-only-cloudflare-worker',
  { prefix: Flag.string('prefix'), vertical: Flag.string('vertical') },
  ({ prefix, vertical }) =>
    buildApiOnlyCloudflareWorker({ prefix, vertical }).pipe(
      Effect.flatMap((outputPath) => Effect.logInfo(`Generated ${outputPath}`)),
    ),
);

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const exit = await runtime.runPromiseExit(
    Command.run({ version: '1.0.0' })(cli).pipe(Effect.tapError((error) => Effect.logError(error))),
  );
  if (Exit.isFailure(exit)) {
    process.exitCode = 1;
  }
}
