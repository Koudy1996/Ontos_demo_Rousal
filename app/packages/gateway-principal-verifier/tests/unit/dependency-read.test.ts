import { TestClock } from 'effect/testing';
import { Predicate, Clock, Effect, Redacted, Schema } from 'effect';
import { expect, it } from 'effect-rstest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { bindDependencyReadVerifier } from '../../src/dependency-read.ts';
import { GatewayPrincipalVerifierConfiguration, bindGatewayPrincipalVerifier } from '../../src/server.ts';
import { GatewayAssertionReplayError } from '@app/core-runtime';

const principal = {
  authBindingId: '10000000-0000-4000-8000-000000000001',
  authContextRef: 'session:dependency',
  authMethod: 'session',
  legalEntityId: '40000000-0000-4000-8000-000000000001',
  principalId: '20000000-0000-4000-8000-000000000001',
  tenantId: '30000000-0000-4000-8000-000000000001',
} as const;
const fixture = () =>
  Effect.gen(function* signedDependency() {
    const pair = yield* Effect.promise(() => generateKeyPair('Ed25519'));
    const jwk = {
      ...(yield* Effect.promise(() => exportJWK(pair.publicKey))),
      alg: 'EdDSA',
      kid: 'dependency-test',
      use: 'sig',
    };
    const issuer = 'https://shell.test';
    yield* TestClock.setTime(1_800_000_000_000);
    const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);
    const sign = (audience: string, expiry: number = now + 300) =>
      Effect.promise(() =>
        new SignJWT({ principal, ver: 1 })
          .setProtectedHeader({ alg: 'EdDSA', kid: 'dependency-test', typ: 'JWT' })
          .setIssuer(issuer)
          .setAudience(audience)
          .setSubject(principal.principalId)
          .setIssuedAt(now)
          .setExpirationTime(expiry)
          .setJti('50000000-0000-4000-8000-000000000001')
          .sign(pair.privateKey),
      );
    return {
      configuration: { configuration: Effect.succeed({ issuer, keySet: createLocalJWKSet({ keys: [jwk] }) }) },
      now,
      sign,
    };
  });

it.effect('verifies the full independent context, rejecting changed and unexpected optional scope', () =>
  Effect.gen(function* contextBinding() {
    const f = yield* fixture();
    const credential = Redacted.make(`Bearer ${yield* f.sign('party-registry')}`);
    const verify = bindDependencyReadVerifier('party-registry');
    const run = (
      expected:
        | typeof principal
        | (Omit<typeof principal, 'tenantId'> & { tenantId: string })
        | (typeof principal & { trustedStorefrontId: string }),
    ) =>
      verify(credential, expected).pipe(Effect.provideService(GatewayPrincipalVerifierConfiguration, f.configuration));
    expect(yield* run(principal)).toBe(credential);
    expect(
      Predicate.isTagged(
        yield* run({ ...principal, tenantId: '30000000-0000-4000-8000-000000000099' }).pipe(Effect.flip),
        'ActionPrincipalScopeError',
      ),
    ).toBe(true);
    expect(
      Predicate.isTagged(
        yield* run({ ...principal, trustedStorefrontId: 'unclaimed-store' }).pipe(Effect.flip),
        'ActionPrincipalScopeError',
      ),
    ).toBe(true);
  }),
);
it.effect('rejects wrong audience, expiry and foreign signatures without exposing the bearer', () =>
  Effect.gen(function* invalidCredentials() {
    const f = yield* fixture();
    const foreign = yield* fixture();
    const tokens = yield* Effect.all([
      f.sign('sales-inquiries'),
      f.sign('party-registry', f.now - 60),
      foreign.sign('party-registry'),
    ]);
    for (const token of tokens) {
      const failure = yield* bindDependencyReadVerifier('party-registry')(
        Redacted.make(`Bearer ${token}`),
        principal,
      ).pipe(Effect.provideService(GatewayPrincipalVerifierConfiguration, f.configuration), Effect.flip);
      expect(Predicate.isTagged(failure, 'ActionPrincipalUnavailableError')).toBe(false);
      expect(yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(failure)).not.toContain(token);
    }
  }),
);
it.effect('does not redeem during inspection; only the Party owner admits the first request', () =>
  Effect.gen(function* ownerRedemption() {
    const f = yield* fixture();
    const credential = Redacted.make(`Bearer ${yield* f.sign('party-registry')}`);
    let redeemed = false;
    const inspect = bindDependencyReadVerifier('party-registry')(credential, principal).pipe(
      Effect.provideService(GatewayPrincipalVerifierConfiguration, f.configuration),
    );
    yield* inspect;
    yield* inspect;
    expect(redeemed).toBe(false);
    const redemption = {
      consume: () =>
        Effect.suspend(() => {
          if (redeemed) {
            return Effect.fail(new GatewayAssertionReplayError({ reason: 'Already consumed' }));
          }
          redeemed = true;
          return Effect.void;
        }),
    };
    const admit = bindGatewayPrincipalVerifier('party-registry')
      .verifyAndRedeem(credential, { redemption })
      .pipe(Effect.provideService(GatewayPrincipalVerifierConfiguration, f.configuration));
    yield* admit;
    expect(Predicate.isTagged(yield* admit.pipe(Effect.flip), 'ActionPrincipalInvalidError')).toBe(true);
  }),
);
