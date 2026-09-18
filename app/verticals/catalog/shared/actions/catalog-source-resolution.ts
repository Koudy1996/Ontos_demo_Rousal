import { Schema } from 'effect';

import { CatalogExternalSourceRecordRefSchema } from '../domain/external-identifier-boundary.ts';
import { CosmeticProductCorrectionSchema, ProductChangeClassificationSchema } from '../domain/product-change-classification.ts';

const checkedUuid = Schema.String.check(Schema.isUUID(), Schema.isTrimmed());
const boundedText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1000), Schema.isTrimmed());
const sourceRevision = Schema.BigIntFromString.check(Schema.isGreaterThanOrEqualToBigInt(0n));
const overrideRevision = Schema.BigIntFromString.check(Schema.isGreaterThanOrEqualToBigInt(1n));

export const CatalogSourceFactScopeSchema = Schema.Struct({
  factKey: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(200), Schema.isTrimmed()),
  targetId: checkedUuid,
  targetKind: Schema.Literals(['PRODUCT', 'VARIANT', 'PACKAGE_DEFINITION']),
  tenantId: checkedUuid,
});

export const CatalogSourceAssertionSchema = Schema.Struct({
  assertionId: checkedUuid,
  effectiveFrom: Schema.DateFromString,
  effectiveTo: Schema.optionalKey(Schema.DateFromString),
  evidencedAt: Schema.DateFromString,
  issuerSystemId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300), Schema.isTrimmed()),
  scope: CatalogSourceFactScopeSchema,
  sourceRecordId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300), Schema.isTrimmed()),
  sourceRevision,
  value: Schema.Json,
  valueFingerprint: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/u)),
});

const CatalogImportDeliveredItemSchema = Schema.Struct({
  assertion: CatalogSourceAssertionSchema,
  captureConfirmed: Schema.Boolean,
  classification: Schema.optionalKey(ProductChangeClassificationSchema),
  recordMeaning: Schema.Literals(['PRODUCT', 'VARIANT', 'PACKAGE_DEFINITION']),
  sourceRecord: CatalogExternalSourceRecordRefSchema,
}).check(
  Schema.makeFilter(({ assertion, sourceRecord }) =>
    assertion.scope.tenantId === sourceRecord.tenantId &&
    assertion.issuerSystemId === sourceRecord.issuerId &&
    assertion.sourceRecordId === sourceRecord.recordId
      ? undefined
      : 'Assertion issuer, source record, and Tenant must match the exact source identity',
  ),
);

export const ImportSourceAssertionPayloadSchema = Schema.Struct({
  items: Schema.Array(CatalogImportDeliveredItemSchema).check(Schema.isMinLength(1), Schema.isMaxLength(100)),
});
export type ImportSourceAssertionPayload = typeof ImportSourceAssertionPayloadSchema.Type;

const ImportAcceptedSchema = Schema.Struct({
  assertionId: checkedUuid,
  classification: Schema.optionalKey(CosmeticProductCorrectionSchema),
  resolvedCurrentChanged: Schema.Boolean,
  sourceRevision,
  status: Schema.Literal('ACCEPTED_BASE'),
});
const ImportRejectedSchema = Schema.Struct({
  reason: boundedText,
  status: Schema.Literals([
    'DUPLICATE',
    'STALE',
    'NO_AUTHORITY',
    'INVALID_TARGET',
    'INVALID_VALUE',
    'HELD',
    'RECONCILIATION_REQUIRED',
    'UNVERIFIABLE',
  ]),
});
export const ImportSourceAssertionResultSchema = Schema.Struct({
  items: Schema.Array(Schema.Union([ImportAcceptedSchema, ImportRejectedSchema])),
  summary: Schema.Struct({
    acceptedBases: Schema.Int,
    allItemsResolved: Schema.Boolean,
    duplicates: Schema.Int,
    held: Schema.Int,
    reconciliationRequired: Schema.Int,
    rejected: Schema.Int,
    resolvedCurrentChanged: Schema.Int,
    stale: Schema.Int,
    unverifiable: Schema.Int,
  }),
});
export type ImportSourceAssertionResult = typeof ImportSourceAssertionResultSchema.Type;

const OverrideCommonSchema = {
  evidenceRef: boundedText,
  reason: boundedText,
  scope: CatalogSourceFactScopeSchema,
};

export const ActivateLocalOverridePayloadSchema = Schema.Struct({
  ...OverrideCommonSchema,
  classification: Schema.optionalKey(ProductChangeClassificationSchema),
  value: Schema.Json,
});
export type ActivateLocalOverridePayload = typeof ActivateLocalOverridePayloadSchema.Type;

export const ChangeLocalOverridePayloadSchema = Schema.Struct({
  ...OverrideCommonSchema,
  classification: Schema.optionalKey(ProductChangeClassificationSchema),
  expectedRevision: overrideRevision,
  value: Schema.Json,
});
export type ChangeLocalOverridePayload = typeof ChangeLocalOverridePayloadSchema.Type;

export const ReleaseLocalOverridePayloadSchema = Schema.Struct({
  ...OverrideCommonSchema,
  expectedRevision: overrideRevision,
});
export type ReleaseLocalOverridePayload = typeof ReleaseLocalOverridePayloadSchema.Type;

const CurrentResolutionSchema = Schema.Union([
  Schema.Struct({ source: Schema.Literals(['BASE', 'LOCAL_OVERRIDE']), status: Schema.Literal('CURRENT') }),
  Schema.Struct({ reason: boundedText, status: Schema.Literals(['ABSENT', 'INVALID', 'NO_AUTHORITY', 'INDETERMINATE']) }),
]);
const AppliedOverrideResultSchema = Schema.Struct({
  classification: Schema.optionalKey(CosmeticProductCorrectionSchema),
  lifecycle: Schema.Literals(['ACTIVE', 'RELEASED']),
  resolved: CurrentResolutionSchema,
  resolvedCurrentChanged: Schema.Boolean,
  revision: overrideRevision,
  status: Schema.Literal('APPLIED'),
});
const RejectedOverrideResultSchema = Schema.Struct({
  reason: boundedText,
  status: Schema.Literals([
    'PERMISSION_REQUIRED',
    'FORBIDDEN_FACT',
    'NO_AUTHORITY',
    'NO_ACTIVE_OVERRIDE',
    'ALREADY_ACTIVE',
    'ALREADY_RELEASED',
    'STALE_EDITOR',
    'INVALID',
    'CONFLICT',
    'UNAVAILABLE',
    'INDETERMINATE',
  ]),
});
export const CatalogLocalOverrideResultSchema = Schema.Union([
  AppliedOverrideResultSchema,
  RejectedOverrideResultSchema,
]);
export type CatalogLocalOverrideResult = typeof CatalogLocalOverrideResultSchema.Type;
