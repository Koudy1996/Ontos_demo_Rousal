import type { OperationalScope, ScopedTransactionExecutor } from '@app/core-runtime';
import { and, eq, isNull } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type {
  CatalogFactScope,
  CatalogLocalOverride,
  CatalogSourceAssertion,
} from '../domain/catalog-source-resolution.ts';
import {
  catalogAcceptedSourceAssertions,
  catalogLocalOverrideHeads,
  catalogLocalOverrideRevisions,
} from '../database/schema.ts';
import type { CatalogSourceResolutionPorts } from './catalog-source-resolution-ports.ts';
import { CatalogSourceResolutionUnavailable } from './catalog-source-resolution-ports.ts';

const unavailable = (cause?: unknown): CatalogSourceResolutionUnavailable => {
  const error = new CatalogSourceResolutionUnavailable({
    code: 'catalog_source_resolution_unavailable',
    reason: 'Catalog source resolution persistence is temporarily unavailable',
  });
  if (cause !== undefined) {
    Object.defineProperty(error, 'cause', { configurable: true, value: cause });
  }
  return error;
};

const scopeWhere = (scope: CatalogFactScope) =>
  and(
    eq(catalogLocalOverrideHeads.tenantId, scope.tenantId),
    eq(catalogLocalOverrideHeads.targetKind, scope.targetKind),
    eq(catalogLocalOverrideHeads.targetId, scope.targetId),
    eq(catalogLocalOverrideHeads.factKey, scope.factKey),
  );

const acceptedScopeWhere = (scope: CatalogFactScope) =>
  and(
    eq(catalogAcceptedSourceAssertions.tenantId, scope.tenantId),
    eq(catalogAcceptedSourceAssertions.targetKind, scope.targetKind),
    eq(catalogAcceptedSourceAssertions.targetId, scope.targetId),
    eq(catalogAcceptedSourceAssertions.factKey, scope.factKey),
  );

const decodeJson = Schema.decodeUnknownEffect(Schema.Json);

export interface CatalogSourceResolutionStoreContext {
  readonly acceptedAt: Date;
  readonly actionInvocationId: string;
  readonly principalId: string;
}

/** Transaction-scoped adapter for immutable source evidence and the override CAS projection. */
export const catalogSourceResolutionStoreForScope = (
  transaction: ScopedTransactionExecutor,
  scope: OperationalScope,
  context: CatalogSourceResolutionStoreContext,
): CatalogSourceResolutionPorts<Schema.Json> => {
  const readAcceptedBases: CatalogSourceResolutionPorts<Schema.Json>['readAcceptedBases'] = Effect.fn(
    'CatalogSourceResolutionStore.readAcceptedBases',
  )(function* readAcceptedBases(requested) {
    if (requested.tenantId !== scope.tenantId) {
      return yield* unavailable();
    }
    const rows = yield* transaction
      .select()
      .from(catalogAcceptedSourceAssertions)
      .where(acceptedScopeWhere(requested))
      .pipe(Effect.mapError(unavailable));
    return yield* Effect.forEach(rows, (row) =>
      decodeJson(row.value).pipe(
        Effect.map((value): CatalogSourceAssertion<Schema.Json> => ({
          assertionId: row.assertionId,
          effectiveFrom: row.effectiveFrom,
          ...(row.effectiveTo === null ? {} : { effectiveTo: row.effectiveTo }),
          evidencedAt: row.evidencedAt,
          issuerSystemId: row.issuerSystemId,
          scope: {
            factKey: row.factKey,
            targetId: row.targetId,
            targetKind:
              row.targetKind === 'VARIANT' || row.targetKind === 'PACKAGE_DEFINITION' ? row.targetKind : 'PRODUCT',
            tenantId: row.tenantId,
          },
          sourceRecordId: row.sourceRecordId,
          sourceRevision: row.sourceRevision,
          value,
          valueFingerprint: row.valueFingerprint,
        })),
        Effect.mapError(unavailable),
      ),
    );
  });

  const readOverrides: CatalogSourceResolutionPorts<Schema.Json>['readOverrides'] = Effect.fn(
    'CatalogSourceResolutionStore.readOverrides',
  )(function* readOverrides(requested) {
    if (requested.tenantId !== scope.tenantId) {
      return yield* unavailable();
    }
    const rows = yield* transaction
      .select({ revision: catalogLocalOverrideRevisions })
      .from(catalogLocalOverrideHeads)
      .innerJoin(
        catalogLocalOverrideRevisions,
        and(
          eq(catalogLocalOverrideRevisions.tenantId, catalogLocalOverrideHeads.tenantId),
          eq(catalogLocalOverrideRevisions.targetKind, catalogLocalOverrideHeads.targetKind),
          eq(catalogLocalOverrideRevisions.targetId, catalogLocalOverrideHeads.targetId),
          eq(catalogLocalOverrideRevisions.factKey, catalogLocalOverrideHeads.factKey),
          eq(catalogLocalOverrideRevisions.revision, catalogLocalOverrideHeads.latestRevision),
        ),
      )
      .where(scopeWhere(requested))
      .pipe(Effect.mapError(unavailable));
    if (rows.length > 1) {
      return yield* unavailable();
    }
    return yield* Effect.forEach(rows, ({ revision: row }) =>
      decodeJson(row.value).pipe(
        Effect.map((value): CatalogLocalOverride<Schema.Json> => ({
          actorPrincipalId: row.actorPrincipalId,
          evidenceRef: row.evidenceRef,
          lifecycle: row.lifecycle === 'RELEASED' ? 'RELEASED' : 'ACTIVE',
          reason: row.reason,
          revision: row.revision,
          scope: {
            factKey: row.factKey,
            targetId: row.targetId,
            targetKind:
              row.targetKind === 'VARIANT' || row.targetKind === 'PACKAGE_DEFINITION' ? row.targetKind : 'PRODUCT',
            tenantId: row.tenantId,
          },
          value,
        })),
        Effect.mapError(unavailable),
      ),
    );
  });

  return {
    appendAcceptedBase: (input) =>
      Effect.gen(function* appendAcceptedBase() {
        const { assertion, authority, sourceRecord, targetResolution } = input;
        if (
          assertion.scope.tenantId !== scope.tenantId ||
          assertion.issuerSystemId !== sourceRecord.issuerId ||
          assertion.sourceRecordId !== sourceRecord.recordId ||
          authority.status !== 'VERIFIED' ||
          authority.issuerSystemId !== assertion.issuerSystemId
        ) {
          return { reason: 'Accepted assertion provenance is inconsistent', status: 'CONFLICT' } as const;
        }
        const correlationCaptureStatus =
          targetResolution.source === 'OWNER_CORRELATION'
            ? 'ALREADY_OWNER_CONFIRMED'
            : input.captureConfirmed
              ? 'CONFIRMED_BEFORE_ACCEPTANCE'
              : null;
        if (correlationCaptureStatus === null) {
          return { reason: 'Required owner correlation capture is not confirmed', status: 'CONFLICT' } as const;
        }
        const inserted = yield* transaction
          .insert(catalogAcceptedSourceAssertions)
          .values({
            acceptedAt: context.acceptedAt,
            actionInvocationId: context.actionInvocationId,
            actingPrincipalId: context.principalId,
            assertionId: assertion.assertionId,
            authorityFactKey: authority.scope.factKey,
            authorityIssuerSystemId: authority.issuerSystemId,
            authorityStatus: authority.status,
            authorityTargetKind: authority.scope.targetKind,
            correlationCaptureStatus,
            correlationRef: targetResolution.source === 'OWNER_CORRELATION' ? targetResolution.correlationRef : null,
            deterministicRuleId: targetResolution.source === 'PRE_APPROVED_RULE' ? targetResolution.ruleId : null,
            effectiveFrom: assertion.effectiveFrom,
            effectiveTo: assertion.effectiveTo ?? null,
            evidencedAt: assertion.evidencedAt,
            factKey: assertion.scope.factKey,
            issuerSystemId: assertion.issuerSystemId,
            sourceIssuerId: sourceRecord.issuerId,
            sourceIssuerKind: sourceRecord.issuerKind,
            sourceRecordId: sourceRecord.recordId,
            sourceRecordNamespace: sourceRecord.recordNamespace,
            sourceRevision: assertion.sourceRevision,
            targetId: assertion.scope.targetId,
            targetKind: assertion.scope.targetKind,
            targetResolutionSource: targetResolution.source,
            tenantId: assertion.scope.tenantId,
            value: assertion.value,
            valueFingerprint: assertion.valueFingerprint,
          })
          .onConflictDoNothing()
          .returning({ assertionId: catalogAcceptedSourceAssertions.assertionId })
          .pipe(Effect.mapError(unavailable));
        if (inserted.length === 1) {
          return { status: 'INSERTED' } as const;
        }
        const rows = yield* transaction
          .select({
            assertionId: catalogAcceptedSourceAssertions.assertionId,
            valueFingerprint: catalogAcceptedSourceAssertions.valueFingerprint,
          })
          .from(catalogAcceptedSourceAssertions)
          .where(
            and(
              acceptedScopeWhere(assertion.scope),
              eq(catalogAcceptedSourceAssertions.sourceIssuerKind, sourceRecord.issuerKind),
              eq(catalogAcceptedSourceAssertions.sourceIssuerId, sourceRecord.issuerId),
              eq(catalogAcceptedSourceAssertions.sourceRecordNamespace, sourceRecord.recordNamespace),
              eq(catalogAcceptedSourceAssertions.sourceRecordId, sourceRecord.recordId),
              eq(catalogAcceptedSourceAssertions.sourceRevision, assertion.sourceRevision),
            ),
          )
          .pipe(Effect.mapError(unavailable));
        return rows.length === 1 &&
          rows[0]?.assertionId === assertion.assertionId &&
          rows[0]?.valueFingerprint === assertion.valueFingerprint
          ? ({ status: 'ALREADY_PRESENT' } as const)
          : ({ reason: 'Source revision conflicts with accepted immutable evidence', status: 'CONFLICT' } as const);
      }),
    appendOverrideRevision: ({ expectedRevision, override }) =>
      Effect.gen(function* appendOverrideRevision() {
        if (override.scope.tenantId !== scope.tenantId) {
          return { activeRevision: null, reason: 'Override Tenant is not trusted', status: 'CONFLICT' } as const;
        }
        const nextHead = {
          activeRevision: override.lifecycle === 'ACTIVE' ? override.revision : null,
          latestRevision: override.revision,
          lifecycle: override.lifecycle,
          updatedAt: context.acceptedAt,
        } as const;
        const advanceHead =
          expectedRevision === null && override.revision === 1n
            ? transaction
                .insert(catalogLocalOverrideHeads)
                .values({ ...nextHead, ...override.scope })
                .onConflictDoNothing()
                .returning({ revision: catalogLocalOverrideHeads.latestRevision })
            : transaction
                .update(catalogLocalOverrideHeads)
                .set(nextHead)
                .where(
                  and(
                    scopeWhere(override.scope),
                    expectedRevision === null
                      ? and(
                          isNull(catalogLocalOverrideHeads.activeRevision),
                          eq(catalogLocalOverrideHeads.latestRevision, override.revision - 1n),
                          eq(catalogLocalOverrideHeads.lifecycle, 'RELEASED'),
                        )
                      : and(
                          eq(catalogLocalOverrideHeads.activeRevision, expectedRevision),
                          eq(catalogLocalOverrideHeads.latestRevision, expectedRevision),
                          eq(catalogLocalOverrideHeads.lifecycle, 'ACTIVE'),
                        ),
                  ),
                )
                .returning({ revision: catalogLocalOverrideHeads.latestRevision });
        const advanced = yield* advanceHead.pipe(Effect.mapError(unavailable));
        if (advanced.length !== 1) {
          return {
            activeRevision: expectedRevision,
            reason: 'Override head changed before compare-and-set',
            status: 'CONFLICT',
          } as const;
        }
        yield* transaction
          .insert(catalogLocalOverrideRevisions)
          .values({
            actionInvocationId: context.actionInvocationId,
            actorPrincipalId: override.actorPrincipalId,
            decidedAt: context.acceptedAt,
            evidenceRef: override.evidenceRef,
            factKey: override.scope.factKey,
            lifecycle: override.lifecycle,
            reason: override.reason,
            revision: override.revision,
            targetId: override.scope.targetId,
            targetKind: override.scope.targetKind,
            tenantId: override.scope.tenantId,
            value: override.value,
          })
          .pipe(Effect.mapError(unavailable));
        return { status: 'APPLIED' } as const;
      }),
    readAcceptedBases,
    readOverrides,
  };
};
