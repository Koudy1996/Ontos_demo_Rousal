import { Context, Effect, Layer } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';
import { expect, it } from 'effect-rstest';
import { salesInquiryCors } from '../../src/auth/cors.ts';

it.effect('allows the configured Shell preflight and actual response but never another origin', () =>
  Effect.gen(function* browserCors() {
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          Layer.mergeAll(
            HttpRouter.add('POST', '/reads/party-selection', HttpServerResponse.empty()),
            salesInquiryCors('https://shell.test'),
          ),
          { disableLogger: true },
        ),
      ),
      (handler) => Effect.promise(() => handler.dispose()),
    );
    const response = yield* Effect.promise(() =>
      server.handler(
        new Request('https://sales.test/reads/party-selection', {
          headers: {
            'access-control-request-headers':
              'authorization,content-type,idempotency-key,x-correlation-id,x-ontos-dependency-authorization',
            'access-control-request-method': 'POST',
            origin: 'https://shell.test',
          },
          method: 'OPTIONS',
        }),
        Context.empty(),
      ),
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('https://shell.test');
    expect(response.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'x-ontos-dependency-authorization',
    );
    for (const origin of ['https://shell.test', 'https://other.test']) {
      const actual = yield* Effect.promise(() =>
        server.handler(
          new Request('https://sales.test/reads/party-selection', {
            headers: { origin },
            method: 'POST',
          }),
          Context.empty(),
        ),
      );
      // A fixed allow-origin header also denies every nonmatching browser origin.
      expect(actual.headers.get('access-control-allow-origin')).toBe('https://shell.test');
    }
  }),
);
