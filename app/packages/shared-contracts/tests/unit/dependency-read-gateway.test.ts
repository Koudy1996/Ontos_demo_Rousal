import { Predicate, Effect, Redacted } from 'effect';
import { expect, it } from 'effect-rstest';
import { FetchHttpClient } from 'effect/unstable/http';
import { HttpApi, HttpApiEndpoint, HttpApiGroup, Schema } from '@modern-js/bff-effect/effect-client';
import { makeGovernedEffectBffClient } from '../../src/client-runtime.ts';
import { makeDependencyReadGateway } from '../../src/dependency-read-gateway.ts';

const failedFetch: typeof fetch = () => Promise.reject(new TypeError('Connection lost'));
const requestUrl = (input: RequestInfo | URL): string => {
  if (Predicate.isString(input)) {
    return input;
  }
  return 'url' in input ? input.url : input.href;
};
const api = HttpApi.make('DependencyTest').add(
  HttpApiGroup.make('reads').add(HttpApiEndpoint.get('read', '/party-display', { success: Schema.String })),
);
const client = makeGovernedEffectBffClient(
  {
    api,
    credential: Redacted.make('Bearer owner'),
    defaultApiPrefix: '/sales-inquiries-api',
    requestCorrelation: 'test',
  },
  { baseUrl: 'https://owner.test/sales-inquiries-api' },
);
const read = client.pipe(Effect.flatMap((value) => value.reads.read({})));

it.effect('sends a fresh dependency credential only once per allowed owner attempt', () =>
  Effect.gen(function* transportIsolation() {
    let issued = 0;
    const captured: Request[] = [];
    const fakeFetch: typeof fetch = (input, init) => {
      captured.push(new Request(new URL(requestUrl(input), 'https://owner.test'), init));
      return Promise.resolve(Response.json('ok'));
    };
    const gateway = makeDependencyReadGateway(
      {
        audience: 'party-registry',
        ownerApiPrefix: '/sales-inquiries-api',
        ownerBaseUrl: () => 'https://owner.test/sales-inquiries-api',
        paths: ['/party-display'],
      },
      () =>
        Effect.sync(() => {
          issued += 1;
          return { expiresAt: 1_900_000_000, token: `assertion-${issued}` };
        }),
    );
    const invocation = gateway
      .invoke(read)
      .pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {}),
        Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
      );
    expect(yield* invocation).toBe('ok');
    expect(yield* invocation).toBe('ok');
    expect(captured.map((request) => request.headers.get('x-ontos-dependency-authorization'))).toEqual([
      'Bearer assertion-1',
      'Bearer assertion-2',
    ]);
    expect(captured.every((request) => request.redirect === 'error')).toBe(true);
    const twice = gateway
      .invoke(Effect.andThen(read, read))
      .pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {}),
        Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
        Effect.flip,
      );
    expect(Predicate.isTagged(yield* twice, 'HttpClientError')).toBe(true);
    expect(captured).toHaveLength(3);
    const escaped = yield* gateway.invoke(client).pipe(Effect.provideService(FetchHttpClient.RequestInit, {}));
    yield* escaped.reads
      .read({})
      .pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {}),
        Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
      );
    expect(captured.at(-1)?.headers.get('x-ontos-dependency-authorization')).toBeNull();
    const wrongOwner = makeGovernedEffectBffClient(
      { api, credential: Redacted.make('Bearer other'), defaultApiPrefix: '/other-api', requestCorrelation: 'test' },
      { baseUrl: 'https://other.test/other-api' },
    ).pipe(Effect.flatMap((value) => value.reads.read({})));
    expect(
      Predicate.isTagged(
        yield* gateway
          .invoke(wrongOwner)
          .pipe(
            Effect.provideService(FetchHttpClient.RequestInit, {}),
            Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
            Effect.flip,
          ),
        'HttpClientError',
      ),
    ).toBe(true);
    expect(captured).toHaveLength(4);
    const wrongDestination = makeGovernedEffectBffClient(
      {
        api,
        credential: Redacted.make('Bearer owner'),
        defaultApiPrefix: '/sales-inquiries-api',
        requestCorrelation: 'test',
      },
      { baseUrl: 'https://other.test/sales-inquiries-api' },
    ).pipe(Effect.flatMap((value) => value.reads.read({})));
    expect(
      Predicate.isTagged(
        yield* gateway
          .invoke(wrongDestination)
          .pipe(
            Effect.provideService(FetchHttpClient.RequestInit, {}),
            Effect.provideService(FetchHttpClient.Fetch, fakeFetch),
            Effect.flip,
          ),
        'HttpClientError',
      ),
    ).toBe(true);
    expect(captured).toHaveLength(4);
  }),
);

it.effect('preserves issuance failure and never executes the owner request', () =>
  Effect.gen(function* failedIssuer() {
    const failure = { _tag: 'IssuerUnavailable' } as const;
    const invocation = makeDependencyReadGateway(
      {
        audience: 'party-registry',
        ownerApiPrefix: '/sales-inquiries-api',
        ownerBaseUrl: () => 'https://owner.test/sales-inquiries-api',
        paths: ['/party-display'],
      },
      () => Effect.fail(failure),
    ).invoke(read);
    expect(yield* invocation.pipe(Effect.provideService(FetchHttpClient.RequestInit, {}), Effect.flip)).toBe(failure);
  }),
);

it.effect('transport failures cannot retain the dependency secret outside the invocation', () =>
  Effect.gen(function* safeFailure() {
    const secret = 'test-dependency-secret';
    const gateway = makeDependencyReadGateway(
      {
        audience: 'party-registry',
        ownerApiPrefix: '/sales-inquiries-api',
        ownerBaseUrl: () => 'https://owner.test/sales-inquiries-api',
        paths: ['/party-display'],
      },
      () => Effect.succeed({ expiresAt: 1_900_000_000, token: secret }),
    );

    const failure = yield* gateway
      .invoke(read)
      .pipe(
        Effect.provideService(FetchHttpClient.RequestInit, {}),
        Effect.provideService(FetchHttpClient.Fetch, failedFetch),
        Effect.flip,
      );
    const rendered = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(failure);
    expect(rendered).not.toContain(secret);
    expect(rendered).not.toContain('x-ontos-dependency-authorization');
  }),
);
