import { Context, Effect, Option, Redacted, Ref } from 'effect';
import { FetchHttpClient, Headers, HttpClientError, HttpClientRequest } from 'effect/unstable/http';

import { issueGatewayContext } from './gateway-context.ts';
import type { GatewayContextClientOptions } from './gateway-context.ts';
import type { OperationGatewayIssuer } from './operation-gateway.ts';

export const DEPENDENCY_READ_AUTHORIZATION_HEADER = 'x-ontos-dependency-authorization';

/** Ephemeral transport context. Never include this credential in command data or evidence. */
interface DependencyReadAttempt {
  readonly credential: Ref.Ref<Option.Option<Redacted.Redacted>>;
  readonly ownerApiPrefix: string;
  readonly ownerBaseUrl: string;
  readonly paths: readonly string[];
}

const DependencyReadCredential = Context.Reference<Option.Option<DependencyReadAttempt>>(
  '@app/shared-contracts/DependencyReadCredential',
  { defaultValue: () => Option.none() },
);

/** Resolve at emission, not construction: an escaped client never retains a credential. */
export const attachDependencyReadCredential = Effect.fn('DependencyReadGateway.attach')(
  function* attachSingleUseCredential(
    ownerApiPrefix: string,
    request: HttpClientRequest.HttpClientRequest,
    effectiveBaseUrl: string,
  ) {
    const current = yield* DependencyReadCredential;
    if (Option.isNone(current)) {
      return request;
    }
    const attempt = current.value;
    const path = URL.parse(request.url, 'https://relative-owner.invalid')?.pathname;
    const allowed =
      effectiveBaseUrl === attempt.ownerBaseUrl &&
      attempt.ownerApiPrefix === ownerApiPrefix &&
      request.url.startsWith('/') &&
      !request.url.startsWith('//') &&
      attempt.paths.some((allowedPath) => path === allowedPath);
    const denied = () =>
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.EncodeError({
          description: 'Dependency credential is unavailable for this request',
          request,
        }),
      });
    if (!allowed) {
      return yield* denied();
    }
    const credential = yield* Ref.getAndSet(attempt.credential, Option.none());
    if (Option.isNone(credential)) {
      return yield* denied();
    }
    return HttpClientRequest.setHeader(request, DEPENDENCY_READ_AUTHORIZATION_HEADER, Redacted.value(credential.value));
  },
);

/** Transport diagnostics must remain safe even when inspected outside this Effect context. */
export const sanitizeDependencyTransportError = (error: HttpClientError.HttpClientError) =>
  error.request.headers[DEPENDENCY_READ_AUTHORIZATION_HEADER] === undefined
    ? error
    : new HttpClientError.HttpClientError({
        reason: new HttpClientError.TransportError({
          description: 'Dependency credential transport failed',
          request: HttpClientRequest.removeHeader(error.request, DEPENDENCY_READ_AUTHORIZATION_HEADER),
        }),
      });

export const withDependencyCredentialRedaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, DEPENDENCY_READ_AUTHORIZATION_HEADER]),
  );

/** Bind a generated owner boundary to one provider; acquire a new credential for each attempt. */
export const makeDependencyReadGateway = <const Audience extends string, IssuerFailure>(
  {
    audience,
    ownerApiPrefix,
    ownerBaseUrl = () => ownerApiPrefix,
    paths,
  }: {
    readonly audience: Audience;
    readonly ownerApiPrefix: string;
    readonly ownerBaseUrl?: () => string;
    readonly paths: readonly string[];
  },
  issuer: OperationGatewayIssuer<Audience, IssuerFailure>,
) => ({
  invoke: <A, E, R>(attempt: Effect.Effect<A, E, R>, options: GatewayContextClientOptions = {}) =>
    Effect.suspend(() => issuer({ audience }, options)).pipe(
      Effect.flatMap(({ token }) => Ref.make(Option.some(Redacted.make(`Bearer ${token}`)))),
      Effect.flatMap((credential) =>
        Effect.updateService(attempt, DependencyReadCredential, () =>
          Option.some({ credential, ownerApiPrefix, ownerBaseUrl: ownerBaseUrl(), paths }),
        ),
      ),
      Effect.updateService(FetchHttpClient.RequestInit, (requestInit): RequestInit => ({
        ...requestInit,
        redirect: 'error',
      })),
      withDependencyCredentialRedaction,
    ),
});

export const bindDependencyReadGateway = (
  audience: string,
  ownerApiPrefix: string,
  paths: readonly string[],
  ownerBaseUrl: () => string = () => ownerApiPrefix,
) => makeDependencyReadGateway({ audience, ownerApiPrefix, ownerBaseUrl, paths }, issueGatewayContext);
