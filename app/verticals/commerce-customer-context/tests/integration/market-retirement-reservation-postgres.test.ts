import { scopedRoutineInvokerFromTransaction } from '@app/core-runtime';
import type {
  MarketAffectedUseAssessmentResponse,
  ReserveMarketRetirementPayload,
  ReserveMarketRetirementResult,
} from '@app/customer-market-retirement-contracts';
import { sql } from 'drizzle-orm';
import { Cause, Effect, Exit, Option, Schema } from 'effect';
import { expect, it } from 'effect-rstest';

import {
  makeTestDatabaseFromPool,
  testDatabasePools,
} from '../../../../packages/core-runtime/tests/support/database.ts';
import type { TestDatabaseFromPool } from '../../../../packages/core-runtime/tests/support/database.ts';
import { commerceCustomerContextRelations } from '../../src/database/schema.ts';
import type { CommerceCustomerContextTransaction } from '../../src/database/types.ts';
import {
  MarketRetirementReservationConflictError,
  marketAffectedUseAssessmentRepositoryForInvoker,
  marketRetirementReservationForTransaction,
} from '../../src/persistence/market-retirement-persistence.ts';

const firstTenantId = 'e4100000-0000-4000-8000-000000000001';
const firstLegalEntityId = 'e4100000-0000-4000-8000-000000000002';
const firstMarketId = 'market-retirement-postgres-release';
const secondTenantId = 'e4200000-0000-4000-8000-000000000001';
const secondLegalEntityId = 'e4200000-0000-4000-8000-000000000002';
const secondMarketId = 'market-retirement-postgres-commit';
const actorPrincipalId = 'e4300000-0000-4000-8000-000000000001';
const evaluatedAt = '2020-01-01T00:00:00.000Z';

const actionInvocationIds = {
  commit: 'e4310000-0000-4000-8000-000000000006',
  commitRetry: 'e4310000-0000-4000-8000-000000000006',
  firstReserve: 'e4310000-0000-4000-8000-000000000001',
  freshReserve: 'e4310000-0000-4000-8000-000000000004',
  release: 'e4310000-0000-4000-8000-000000000003',
  secondReserve: 'e4310000-0000-4000-8000-000000000002',
  terminalRelease: 'e4310000-0000-4000-8000-000000000007',
  versionProbe: 'e4310000-0000-4000-8000-000000000005',
} as const;

type CommerceCustomerContextTestDatabase = TestDatabaseFromPool<typeof commerceCustomerContextRelations>;
type ReservePayload = Extract<ReserveMarketRetirementPayload, { readonly operation: 'RESERVE' }>;
type FinishPayload<Operation extends 'COMMIT' | 'RELEASE'> = Extract<
  ReserveMarketRetirementPayload,
  { readonly operation: Operation }
>;

interface ReservationRow extends Record<string, unknown> {
  readonly assessment_digest: string;
  readonly lifecycle: 'COMMITTED' | 'RELEASED' | 'RESERVED';
  readonly market_resource_id: string;
  readonly market_revision: number;
  readonly reservation_version: number;
  readonly source_evidence: unknown;
}

const one = <Row>(rows: readonly Row[]): Row => {
  const [row] = rows;
  if (row === undefined) {
    throw new Error('Expected one Market retirement reservation row');
  }
  return row;
};

const inOwnerScope = <Value, Failure>(
  database: CommerceCustomerContextTestDatabase,
  tenantId: string,
  legalEntityId: string,
  operation: (transaction: CommerceCustomerContextTransaction) => Effect.Effect<Value, Failure>,
) =>
  database.transaction((transaction) =>
    Effect.gen(function* scopedOperation() {
      yield* transaction.execute(
        sql`select set_config('ontos.tenant_id', ${tenantId}, true),
                   set_config('ontos.legal_entity_id', ${legalEntityId}, true)`,
        'objects',
      );
      return yield* operation(transaction);
    }),
  );

const invokerFor = (transaction: CommerceCustomerContextTransaction, tenantId: string, legalEntityId: string) =>
  scopedRoutineInvokerFromTransaction((statement) => transaction.execute(statement, 'objects'), {
    legalEntityId,
    tenantId,
  });

const reserveInput = (
  assessment: Extract<MarketAffectedUseAssessmentResponse, { readonly outcome: 'VERIFIED' }>,
): ReservePayload => ({
  assessmentDigest: assessment.assessmentDigest,
  evaluatedAt: assessment.evaluatedAt,
  marketRef: assessment.marketRef,
  marketRevision: assessment.marketRevision,
  operation: 'RESERVE',
  reason: 'PostgreSQL Market retirement reservation acceptance',
  sourceEvidence: assessment.sourceEvidence,
  tenantId: assessment.tenantId,
});

const assess = (
  database: CommerceCustomerContextTestDatabase,
  tenantId: string,
  legalEntityId: string,
  marketId: string,
  marketRevision: number,
) =>
  inOwnerScope(database, tenantId, legalEntityId, (transaction) =>
    marketAffectedUseAssessmentRepositoryForInvoker(invokerFor(transaction, tenantId, legalEntityId)).assess({
      evaluatedAt,
      marketRef: {
        moduleId: 'commerce.market-catalog',
        resourceId: marketId,
        resourceType: 'commerce.market-catalog.market',
        tenantId,
      },
      marketRevision,
      tenantId,
    }),
  ).pipe(
    Effect.flatMap((assessment) =>
      assessment.outcome === 'VERIFIED'
        ? Effect.succeed(assessment)
        : Effect.die(`Expected VERIFIED assessment, received ${assessment.outcome}`),
    ),
  );

const execute = (
  database: CommerceCustomerContextTestDatabase,
  tenantId: string,
  legalEntityId: string,
  payload: ReserveMarketRetirementPayload,
  actionInvocationId: string,
) =>
  inOwnerScope(database, tenantId, legalEntityId, (transaction) =>
    marketRetirementReservationForTransaction(invokerFor(transaction, tenantId, legalEntityId)).execute(payload, {
      actionInvocationId,
      actorPrincipalId,
    }),
  );

const finishInput = (operation: 'COMMIT', reservation: ReserveMarketRetirementResult): FinishPayload<'COMMIT'> => ({
  marketRef: reservation.marketRef,
  marketRevision: reservation.marketRevision,
  operation,
  reason: `PostgreSQL Market retirement ${operation.toLowerCase()} acceptance`,
  reservationToken: reservation.reservationToken,
  reservationVersion: reservation.reservationVersion,
  tenantId: reservation.tenantId,
});

const releaseInput = (reservation: ReserveMarketRetirementResult): FinishPayload<'RELEASE'> => ({
  marketRef: reservation.marketRef,
  marketRevision: reservation.marketRevision,
  operation: 'RELEASE',
  reason: 'PostgreSQL Market retirement release acceptance',
  reservationToken: reservation.reservationToken,
  reservationVersion: reservation.reservationVersion,
  tenantId: reservation.tenantId,
});

const isReservationConflict = (exit: Exit.Exit<unknown, unknown>): boolean =>
  Exit.isFailure(exit) &&
  Option.exists(Cause.findErrorOption(exit.cause), Schema.is(MarketRetirementReservationConflictError));

const cleanupReservations = (admin: CommerceCustomerContextTestDatabase) => () =>
  admin.transaction((transaction) =>
    transaction.execute(
      sql`delete from commerce_customer_context.market_retirement_reservations
            where tenant_id in (${firstTenantId}::uuid, ${secondTenantId}::uuid)`,
      'objects',
    ),
  );

it.live(
  'serializes competing reservations, preserves exact evidence, and releases the Market for a fresh reservation',
  () =>
    Effect.scoped(
      Effect.gen(function* reservationReleaseAcceptance() {
        const { admin: adminPool, runtimePool } = yield* testDatabasePools;
        const admin = yield* makeTestDatabaseFromPool(adminPool, commerceCustomerContextRelations);
        const runtime = yield* makeTestDatabaseFromPool(runtimePool, commerceCustomerContextRelations);
        const cleanup = cleanupReservations(admin);

        yield* cleanup();
        yield* Effect.addFinalizer(() => cleanup().pipe(Effect.orDie));

        const assessment = yield* assess(runtime, firstTenantId, firstLegalEntityId, firstMarketId, 17);
        const payload = reserveInput(assessment);
        const attempts = yield* Effect.all(
          [
            execute(runtime, firstTenantId, firstLegalEntityId, payload, actionInvocationIds.firstReserve).pipe(
              Effect.exit,
            ),
            execute(runtime, firstTenantId, firstLegalEntityId, payload, actionInvocationIds.secondReserve).pipe(
              Effect.exit,
            ),
          ],
          { concurrency: 'unbounded' },
        );

        expect(attempts.filter(Exit.isSuccess)).toHaveLength(1);
        expect(attempts.filter(Exit.isFailure)).toHaveLength(1);
        expect(attempts.some(isReservationConflict)).toBe(true);

        const firstSucceeded = Exit.isSuccess(attempts[0]);
        const successfulAttempt = firstSucceeded ? attempts[0] : attempts[1];
        const reservation = yield* Exit.isSuccess(successfulAttempt)
          ? Effect.succeed(successfulAttempt.value)
          : Effect.failCause(successfulAttempt.cause);
        expect(reservation).toMatchObject({
          assessmentDigest: assessment.assessmentDigest,
          lifecycle: 'RESERVED',
          marketRevision: 17,
          reservationVersion: 1,
        });

        const stored = yield* inOwnerScope(runtime, firstTenantId, firstLegalEntityId, (transaction) =>
          transaction
            .execute<ReservationRow>(
              sql`select assessment_digest, lifecycle, market_resource_id, market_revision,
                       reservation_version, source_evidence
                  from commerce_customer_context.market_retirement_reservations
                 where market_retirement_reservation_id = ${reservation.reservationToken}::uuid`,
              'objects',
            )
            .pipe(Effect.map(one)),
        );
        expect(stored).toMatchObject({
          assessment_digest: assessment.assessmentDigest,
          lifecycle: 'RESERVED',
          market_resource_id: firstMarketId,
          market_revision: 17,
          reservation_version: 1,
          source_evidence: assessment.sourceEvidence,
        });

        const winningActionInvocationId = firstSucceeded
          ? actionInvocationIds.firstReserve
          : actionInvocationIds.secondReserve;
        const wrongDigest = yield* Effect.exit(
          execute(
            runtime,
            firstTenantId,
            firstLegalEntityId,
            { ...payload, assessmentDigest: 'f'.repeat(64) },
            winningActionInvocationId,
          ),
        );
        expect(isReservationConflict(wrongDigest)).toBe(true);

        const wrongVersion = yield* Effect.exit(
          execute(
            runtime,
            firstTenantId,
            firstLegalEntityId,
            {
              ...releaseInput(reservation),
              reservationVersion: reservation.reservationVersion + 1,
            },
            actionInvocationIds.versionProbe,
          ),
        );
        expect(isReservationConflict(wrongVersion)).toBe(true);

        const released = yield* execute(
          runtime,
          firstTenantId,
          firstLegalEntityId,
          releaseInput(reservation),
          actionInvocationIds.release,
        );
        expect(released).toMatchObject({ lifecycle: 'RELEASED', reservationVersion: 2 });

        const fresh = yield* execute(
          runtime,
          firstTenantId,
          firstLegalEntityId,
          payload,
          actionInvocationIds.freshReserve,
        );
        expect(fresh).toMatchObject({ lifecycle: 'RESERVED', reservationVersion: 1 });
        expect(fresh.reservationToken).not.toBe(reservation.reservationToken);
      }),
    ),
);

it.live('makes COMMIT terminal and idempotent for the exact Action retry', () =>
  Effect.scoped(
    Effect.gen(function* reservationCommitAcceptance() {
      const { admin: adminPool, runtimePool } = yield* testDatabasePools;
      const admin = yield* makeTestDatabaseFromPool(adminPool, commerceCustomerContextRelations);
      const runtime = yield* makeTestDatabaseFromPool(runtimePool, commerceCustomerContextRelations);
      const cleanup = cleanupReservations(admin);

      yield* cleanup();
      yield* Effect.addFinalizer(() => cleanup().pipe(Effect.orDie));

      const assessment = yield* assess(runtime, secondTenantId, secondLegalEntityId, secondMarketId, 23);
      const reservation = yield* execute(
        runtime,
        secondTenantId,
        secondLegalEntityId,
        reserveInput(assessment),
        actionInvocationIds.firstReserve,
      );
      const commitPayload = finishInput('COMMIT', reservation);
      const committed = yield* execute(
        runtime,
        secondTenantId,
        secondLegalEntityId,
        commitPayload,
        actionInvocationIds.commit,
      );
      const retried = yield* execute(
        runtime,
        secondTenantId,
        secondLegalEntityId,
        commitPayload,
        actionInvocationIds.commitRetry,
      );

      expect(committed).toMatchObject({ lifecycle: 'COMMITTED', reservationVersion: 2 });
      expect(retried).toEqual(committed);

      const terminalFailure = yield* Effect.exit(
        execute(
          runtime,
          secondTenantId,
          secondLegalEntityId,
          releaseInput(committed),
          actionInvocationIds.terminalRelease,
        ),
      );
      expect(isReservationConflict(terminalFailure)).toBe(true);
    }),
  ),
);
