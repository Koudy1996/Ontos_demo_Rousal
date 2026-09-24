import { Layer, Logger, ManagedRuntime, References, Tracer } from 'effect';
import type { Effect } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    Layer.succeed(FetchHttpClient.RequestInit, { redirect: 'error' }),
    Logger.layer([Logger.defaultLogger, Logger.tracerLogger]),
    Layer.succeed(Tracer.Tracer, Tracer.make({ span: (options) => new Tracer.NativeSpan(options) })),
    Layer.succeed(References.MinimumLogLevel, 'Info'),
  ),
);

export const runJobExpensesEffect = <A>(effect: Effect.Effect<A, never, FetchHttpClient.RequestInit>) =>
  runtime.runFork(effect);
