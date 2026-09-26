import {
  findPostgresFailure,
  GatewayAssertionRedemptionService,
  GatewayAssertionRedemptionUnavailableError,
  GatewayAssertionReplayError,
} from '@app/core-runtime';
import { GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS } from '@app/shared-contracts';
import { lt } from 'drizzle-orm';
import { Clock, DateTime, Effect, Layer } from 'effect';
import { gatewayAssertionRedemptions } from '../database/schema.ts';
import { PaymentTermCatalogDatabase } from '../database/client.ts';

const unavailable = (cause: unknown) =>
  Object.defineProperty(
    new GatewayAssertionRedemptionUnavailableError({ reason: 'Assertion replay storage unavailable' }),
    'cause',
    { enumerable: false, value: findPostgresFailure(cause) },
  );

export const GatewayAssertionRedemptionLive = Layer.effect(
  GatewayAssertionRedemptionService,
  Effect.gen(function* makeReplayStore() {
    const { executor: database } = yield* PaymentTermCatalogDatabase;
    return {
      consume: Effect.fn('PaymentTermCatalogAssertion.consume')(function* consume(input) {
        const now = yield* Clock.currentTimeMillis;
        if ((input.expiresAtEpochSeconds + GATEWAY_ASSERTION_CLOCK_SKEW_SECONDS) * 1000 <= now) {
          return yield* new GatewayAssertionReplayError({ reason: 'Assertion expired' });
        }
        const inserted = yield* Effect.gen(function* redeem() {
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
