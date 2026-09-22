import { Schema } from 'effect';

import { MarketRefSchema } from '../resources/market.ts';

const strict = { parseOptions: { onExcessProperty: 'error' as const } };
const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500), Schema.isTrimmed());
const moduleKey = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(200),
  Schema.isPattern(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u),
);
const positiveRevision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const referenceCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const utcInstant = Schema.toEncoded(Schema.DateTimeUtcFromString);

export const MarketRetirementReferenceEvidenceSchema = Schema.Struct({
  count: referenceCount,
  evidenceReference: nonEmptyText,
}).annotate(strict);
export type MarketRetirementReferenceEvidence = typeof MarketRetirementReferenceEvidenceSchema.Type;

export const MarketRetirementProviderAssessmentSchema = Schema.Struct({
  completenessEvidenceReference: nonEmptyText,
  currentnessEvidenceReference: nonEmptyText,
  effectiveAt: utcInstant,
  liveBlockingReferences: MarketRetirementReferenceEvidenceSchema,
  nextBoundaryAt: Schema.optionalKey(utcInstant),
  observedAt: utcInstant,
  ownerModuleKey: moduleKey,
  ownerRevision: nonEmptyText,
  retainedHistoryEvidence: MarketRetirementReferenceEvidenceSchema,
  versionToken: nonEmptyText,
}).annotate(strict);
export type MarketRetirementProviderAssessment = typeof MarketRetirementProviderAssessmentSchema.Type;

export const MarketRetirementImpactAssessmentSchema = Schema.Struct({
  assessedMarketRef: MarketRefSchema,
  assessedMarketRevision: positiveRevision,
  effectiveAt: utcInstant,
  providers: Schema.Array(MarketRetirementProviderAssessmentSchema).check(Schema.isMaxLength(32)),
  requiredProviderModuleKeys: Schema.Array(moduleKey).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  reservationToken: nonEmptyText,
}).annotate(strict);
export type MarketRetirementImpactAssessment = typeof MarketRetirementImpactAssessmentSchema.Type;
