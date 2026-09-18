import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { ConfigurationUnitCurrent } from '../../shared/domain/configuration-unit.ts';
import { CONFIGURATION_UNIT_RESOURCE_TYPE } from '../../shared/domain/configuration-unit.ts';
import { configurationUnitRevisions, configurationUnits } from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class ConfigurationUnitPersistenceUnavailable extends Schema.TaggedError<ConfigurationUnitPersistenceUnavailable>()(
  'ConfigurationUnitPersistenceUnavailable',
  { code: Schema.Literal('configuration_unit_persistence_unavailable'), reason: Schema.String },
) {}

const unavailable = (cause?: unknown) => {
  const failure = new ConfigurationUnitPersistenceUnavailable({
    code: 'configuration_unit_persistence_unavailable',
    reason: 'Authoritative Configuration Unit evidence is unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  }
  return failure;
};

export interface ConfigurationUnitPersistence {
  /** No/latest ambiguity is explicit; caller must fail closed unless status is CONFIRMED and ACTIVE. */
  readonly readCurrent: (
    unitId: string,
    assessedAt: Date,
  ) => Effect.Effect<ConfigurationUnitCurrent, ConfigurationUnitPersistenceUnavailable>;
}

/** The caller supplies Core's trusted assessment instant and scoped owner transaction. */
export const configurationUnitPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
): ConfigurationUnitPersistence => ({
  readCurrent: Effect.fn('ConfigurationUnitPersistence.readCurrent')(function* readCurrent(unitId, assessedAt) {
    if (
      !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(unitId) ||
      !Number.isFinite(assessedAt.getTime())
    ) {
      return { status: 'NO_CURRENT' } as const;
    }
    const [unit] = yield* transaction
      .select({ unitId: configurationUnits.unitId })
      .from(configurationUnits)
      .where(and(eq(configurationUnits.tenantId, scope.tenantId), eq(configurationUnits.unitId, unitId)))
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (unit === undefined) {
      return { status: 'NOT_FOUND' } as const;
    }
    const revisions = yield* transaction
      .select()
      .from(configurationUnitRevisions)
      .where(
        and(
          eq(configurationUnitRevisions.tenantId, scope.tenantId),
          eq(configurationUnitRevisions.unitId, unitId),
          lte(configurationUnitRevisions.effectiveFrom, assessedAt),
          or(isNull(configurationUnitRevisions.effectiveTo), gt(configurationUnitRevisions.effectiveTo, assessedAt)),
        ),
      )
      .limit(2)
      .pipe(Effect.mapError(unavailable));
    if (revisions.length === 0) {
      return { status: 'NO_CURRENT' } as const;
    }
    if (revisions.length !== 1) {
      return { status: 'CONFLICT' } as const;
    }
    const [row] = revisions;
    if (row === undefined || row.lifecycleState !== 'ACTIVE') {
      return { status: 'RETIRED' } as const;
    }
    if (row.evidenceRefs.length === 0 || row.evidenceRefs.some((ref) => ref.trim() !== ref || ref.length === 0)) {
      return yield* unavailable();
    }
    const revision = {
      dimension: row.dimension,
      effectiveFrom: row.effectiveFrom,
      evidenceRefs: row.evidenceRefs,
      lifecycleState: 'ACTIVE' as const,
      meaning: row.meaning,
      ref: {
        moduleId: 'commerce.catalog' as const,
        resourceId: unitId,
        resourceType: CONFIGURATION_UNIT_RESOURCE_TYPE,
        tenantId: scope.tenantId,
      },
      revision: row.revision,
    };
    return {
      assessedAt,
      revision: row.effectiveTo === null ? revision : { ...revision, effectiveTo: row.effectiveTo },
      status: 'CONFIRMED',
    } as const;
  }),
});
