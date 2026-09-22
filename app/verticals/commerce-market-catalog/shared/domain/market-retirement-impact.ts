import { OntosModuleIdSchema } from '@app/core-runtime';
import { Schema } from 'effect';

import { MarketRefSchema } from '../resources/market.ts';

const strict = { parseOptions: { onExcessProperty: 'error' as const } };
const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500), Schema.isTrimmed());
const positiveRevision = Schema.Int.check(Schema.isGreaterThanOrEqualTo(1));
const referenceCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));
const utcInstant = Schema.toEncoded(Schema.DateTimeUtcFromString);

const MarketRetirementReferenceEvidenceSchema = Schema.Struct({
  count: referenceCount,
  evidenceReference: nonEmptyText,
}).annotate(strict);

export const MarketRetirementProviderAssessmentSchema = Schema.Struct({
  completenessEvidenceReference: nonEmptyText,
  currentnessEvidenceReference: nonEmptyText,
  effectiveAt: utcInstant,
  liveBlockingReferences: MarketRetirementReferenceEvidenceSchema,
  nextBoundaryAt: Schema.optionalKey(utcInstant),
  observedAt: utcInstant,
  ownerModuleKey: OntosModuleIdSchema,
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
  requiredProviderModuleKeys: Schema.Array(OntosModuleIdSchema).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
  reservationToken: nonEmptyText,
}).annotate(strict);
export type MarketRetirementImpactAssessment = typeof MarketRetirementImpactAssessmentSchema.Type;
