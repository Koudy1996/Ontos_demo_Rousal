import { Option, Schema } from 'effect';

import { CatalogRevisionInstantSchema } from './catalog-revision-reference.ts';
import { CatalogSelectionBasisListSchema, CatalogSelectionSchema } from './catalog-selection-evidence.ts';
import type { CatalogSelection, CatalogSelectionEvidence } from './catalog-selection-evidence.ts';
import { CatalogSelectionPurposeSchema } from './catalog-selection-purpose.ts';
import type { CatalogSelectionPurpose } from './catalog-selection-purpose.ts';

/** The only guarantee Catalog may issue: the exact selection and the exact source basis. */
export const CatalogSelectionValidityGuarantee = 'EXACT_SELECTION_AND_CURRENT_BASIS_UNCHANGED' as const;

/**
 * Catalog-issued, time-bounded confirmation. It states what it guarantees and how it behaves on
 * change (`REASSESS`) and retirement (`INVALIDATE`); it is never constructed from a stale cache.
 */
export const CatalogSelectionValidityAttestationSchema = Schema.Struct({
  assessedAt: CatalogRevisionInstantSchema,
  basis: CatalogSelectionBasisListSchema,
  guarantee: Schema.Literal(CatalogSelectionValidityGuarantee),
  issuedAt: CatalogRevisionInstantSchema,
  onRetirement: Schema.Literal('INVALIDATE'),
  onSourceChange: Schema.Literal('REASSESS'),
  purpose: CatalogSelectionPurposeSchema,
  selection: CatalogSelectionSchema,
  source: Schema.Literal('CATALOG_OWNER_CURRENT_READ'),
  validUntil: Schema.optionalKey(CatalogRevisionInstantSchema),
}).check(
  Schema.makeFilter(({ assessedAt, issuedAt, validUntil }) => {
    if (issuedAt < assessedAt) {
      return 'A validity attestation cannot be issued before its assessment';
    }
    return validUntil !== undefined && validUntil <= issuedAt
      ? 'A validity window must end after the attestation is issued'
      : undefined;
  }),
);
export type CatalogSelectionValidityAttestation = typeof CatalogSelectionValidityAttestationSchema.Type;

export interface CatalogSelectionValidityRequest {
  readonly at: CatalogSelectionEvidence['assessedAt'];
  readonly purpose: CatalogSelectionPurpose;
  readonly selection: CatalogSelection;
}

const sameSelection = Schema.toEquivalence(CatalogSelectionSchema);

/**
 * True only while the request matches the attested exact selection and purpose and falls inside
 * the issued window. A source change requires re-assessment; retirement invalidates outright.
 */
export const catalogSelectionValidityCovers = (
  attestation: CatalogSelectionValidityAttestation,
  request: CatalogSelectionValidityRequest,
): boolean =>
  attestation.source === 'CATALOG_OWNER_CURRENT_READ' &&
  attestation.guarantee === CatalogSelectionValidityGuarantee &&
  attestation.onSourceChange === 'REASSESS' &&
  attestation.onRetirement === 'INVALIDATE' &&
  attestation.purpose === request.purpose &&
  sameSelection(attestation.selection, request.selection) &&
  request.at >= attestation.issuedAt &&
  (attestation.validUntil === undefined || request.at < attestation.validUntil);

/**
 * Mint a validity attestation only from a fresh VALID owner assessment whose purpose matches.
 * INVALID, INDETERMINATE, mismatched, or expired-window inputs return `undefined`; no cached or
 * historical projection can become a Current guarantee.
 */
export const catalogSelectionValidityAttestationFor = (input: {
  readonly evidence: CatalogSelectionEvidence;
  readonly purpose: CatalogSelectionPurpose;
  readonly validUntil?: CatalogSelectionEvidence['validUntil'];
}): CatalogSelectionValidityAttestation | undefined => {
  const { evidence, purpose, validUntil } = input;
  if (evidence.status !== 'VALID' || evidence.purpose !== purpose) {
    return undefined;
  }
  if (validUntil !== undefined && validUntil <= evidence.assessedAt) {
    return undefined;
  }
  const base = {
    assessedAt: evidence.assessedAt,
    basis: evidence.basis,
    guarantee: CatalogSelectionValidityGuarantee,
    issuedAt: evidence.assessedAt,
    onRetirement: 'INVALIDATE' as const,
    onSourceChange: 'REASSESS' as const,
    purpose,
    selection: evidence.selection,
    source: 'CATALOG_OWNER_CURRENT_READ' as const,
  };
  const decoded = Schema.decodeOption(CatalogSelectionValidityAttestationSchema)(
    validUntil === undefined ? base : { ...base, validUntil },
  );
  return Option.isSome(decoded) ? decoded.value : undefined;
};
