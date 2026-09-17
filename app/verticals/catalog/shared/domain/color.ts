import { Schema } from 'effect';

import { CatalogResourceRefSchema } from './catalog-revision-reference.ts';

const text = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(500), Schema.isTrimmed());
const colorRef = CatalogResourceRefSchema.check(
  Schema.makeFilter((ref) =>
    ref.resourceType === 'commerce.catalog.controlled-attribute-value'
      ? undefined
      : 'Color must reference a Catalog controlled value',
  ),
);

/** A preview illustrates a Color; it is never a physical-shade identity or equivalence key. */
export const ColorPreviewSchema = Schema.Union([
  Schema.Struct({ hex: Schema.String.check(Schema.isPattern(/^#[0-9a-fA-F]{6}$/u)), kind: Schema.Literal('HEX') }),
  Schema.Struct({
    blue: Schema.Number.check(Schema.isInt(), Schema.isBetween({ maximum: 255, minimum: 0 })),
    green: Schema.Number.check(Schema.isInt(), Schema.isBetween({ maximum: 255, minimum: 0 })),
    kind: Schema.Literal('RGB'),
    red: Schema.Number.check(Schema.isInt(), Schema.isBetween({ maximum: 255, minimum: 0 })),
  }),
  Schema.Struct({ kind: Schema.Literal('ILLUSTRATION'), mediaRef: text }),
]);
export type ColorPreview = typeof ColorPreviewSchema.Type;

/** Swatch provenance is optional, but every Color needs a stated basis for its distinction. */
export const ColorDistinctionEvidenceSchema = Schema.Union([
  Schema.Struct({ designation: text, kind: Schema.Literal('SWATCH'), source: text, sourceScope: text, system: text }),
  Schema.Struct({ description: text, kind: Schema.Literal('OTHER'), source: text, sourceScope: text }),
]);
export type ColorDistinctionEvidence = typeof ColorDistinctionEvidenceSchema.Type;

/** The Tenant-qualified controlled-value reference, not the name/group/preview, is identity. */
export const ColorSchema = Schema.Struct({
  displayName: text,
  distinctionEvidence: ColorDistinctionEvidenceSchema,
  groupName: Schema.optionalKey(text),
  preview: Schema.optionalKey(ColorPreviewSchema),
  ref: colorRef,
});
export type Color = typeof ColorSchema.Type;

export const sameColorIdentity = (left: Color, right: Color): boolean =>
  left.ref.tenantId === right.ref.tenantId && left.ref.resourceId === right.ref.resourceId;

/** Review explicitly determines whether a revision preserves meaning; metadata cannot prove it. */
export const ColorRevisionDecisionSchema = Schema.Struct({
  after: ColorSchema,
  before: ColorSchema,
  reviewEvidence: text,
  samePhysicalMeaningConfirmed: Schema.Boolean,
}).check(
  Schema.makeFilter(({ after, before, samePhysicalMeaningConfirmed }) => {
    if (before.ref.tenantId !== after.ref.tenantId) {
      return 'Color revision cannot cross Tenants';
    }
    if (samePhysicalMeaningConfirmed && !sameColorIdentity(before, after)) {
      return 'A same-meaning Color revision must preserve identity';
    }
    return !samePhysicalMeaningConfirmed && sameColorIdentity(before, after)
      ? 'A changed physical meaning requires a new Color identity'
      : undefined;
  }),
);
export type ColorRevisionDecision = typeof ColorRevisionDecisionSchema.Type;

/** References retain both Tenant and Color identity, independently of later display changes. */
export const ColorHistoricalReferenceSchema = Schema.Struct({
  acceptedDisplayName: text,
  acceptedDistinctionEvidence: ColorDistinctionEvidenceSchema,
  colorRef,
});
export type ColorHistoricalReference = typeof ColorHistoricalReferenceSchema.Type;
