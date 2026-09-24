import {
  findPostgresFailure,
  GatewayAssertionRedemptionService,
  GatewayAssertionRedemptionUnavailableError,
  GatewayAssertionReplayError,
} from '@app/core-runtime';
import { GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS } from '@app/shared-contracts';
import { makeWithDefaults } from 'drizzle-orm/effect-postgres';
import { lt } from 'drizzle-orm';
import { Clock, DateTime, Effect, Layer } from 'effect';
import { gatewayAssertionRedemptions } from '../db/schema.ts';

const unavailable = (cause: unknown) =>
  Object.defineProperty(
    new GatewayAssertionRedemptionUnavailableError({ reason: 'Assertion replay storage unavailable' }),
    'cause',
    { enumerable: false, value: findPostgresFailure(cause) },
  );
export const GatewayAssertionRedemptionLive = Layer.effect(
  GatewayAssertionRedemptionService,
  Effect.gen(function* makeReplayStore() {
    const database = yield* makeWithDefaults({});
    return {
      consume: Effect.fn('WorkforceAssertion.consume')(function* consume(input) {
        const now = yield* Clock.currentTimeMillis;
        if ((input.expiresAtEpochSeconds + GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS) * 1000 <= now) {
          return yield* new GatewayAssertionReplayError({ reason: 'Assertion expired' });
        }
        const inserted = yield* Effect.gen(function* redeem() {
          // Keep replay evidence beyond the complete five-second in-flight redemption budget.
          yield* database
            .delete(gatewayAssertionRedemptions)
            .where(
              lt(
                gatewayAssertionRedemptions.expiresAt,
                DateTime.toDateUtc(DateTime.makeUnsafe(now - (GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS + 60) * 1000)),
              ),
            );
          return yield* database
            .insert(gatewayAssertionRedemptions)
            .values({
              audience: input.audience,
              expiresAt: DateTime.toDateUtc(DateTime.makeUnsafe(input.expiresAtEpochSeconds * 1000)),
              issuer: input.issuer,
              jti: input.jti,
            })
            .onConflictDoNothing()
            .returning({ jti: gatewayAssertionRedemptions.jti });
        }).pipe(
          Effect.mapError(unavailable),
          Effect.timeoutOrElse({ duration: '5 seconds', orElse: () => Effect.fail(unavailable(null)) }),
        );
        if (inserted.length === 0) {
          return yield* new GatewayAssertionReplayError({ reason: 'Assertion already consumed' });
        }
        const completedAt = yield* Clock.currentTimeMillis;
        if ((input.expiresAtEpochSeconds + GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS) * 1000 <= completedAt) {
          return yield* new GatewayAssertionReplayError({ reason: 'Assertion expired during redemption' });
        }
        return yield* Effect.void;
      }),
    };
  }),
);
