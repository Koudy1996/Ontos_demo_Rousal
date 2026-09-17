import { Schema } from 'effect';

import { ProductRefSchema } from '../resources/product.ts';
import { VariantRefSchema } from '../resources/variant.ts';

const uuid = Schema.String.check(Schema.isUUID(), Schema.isTrimmed());
const ownerKey = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160), Schema.isTrimmed());
const ownerModuleId = ownerKey.pipe(Schema.brand('CatalogDocumentOwnerModuleId'), Schema.decodeTo(ownerKey));
const resourceId = uuid.pipe(Schema.brand('CatalogDocumentResourceId'), Schema.decodeTo(uuid));
const tenantId = uuid.pipe(Schema.brand('CatalogDocumentTenantId'), Schema.decodeTo(uuid));

/** An opaque owner-qualified identity, not a file, URL, or document version. */
export const CatalogDocumentResourceRefSchema = Schema.Struct({
  moduleId: ownerModuleId,
  resourceId,
  resourceType: ownerKey,
  tenantId,
}).check(
  Schema.makeFilter(({ moduleId, resourceType }) =>
    resourceType.startsWith(`${moduleId}.`) ? undefined : 'Resource type must be qualified by its owner',
  ),
);
export type CatalogDocumentResourceRef = typeof CatalogDocumentResourceRefSchema.Type;

export const CatalogMediaAssignmentIdSchema = uuid.pipe(
  Schema.brand('CatalogMediaAssignmentId'),
  Schema.decodeTo(uuid),
);
export const CatalogMediaAssignmentRevisionSchema = Schema.Finite.check(
  Schema.isInt(),
  Schema.isBetween({ maximum: 2_147_483_647, minimum: 1 }),
);
export const CatalogMediaPurposeSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
  Schema.isTrimmed(),
);
export const CatalogMediaOrderSchema = Schema.Finite.check(
  Schema.isInt(),
  Schema.isBetween({ maximum: 2_147_483_647, minimum: 1 }),
);

/** Assignment identity and revision belong to Catalog; the Resource remains with its owner. */
export const CatalogMediaAssignmentSchema = Schema.Struct({
  assignmentId: CatalogMediaAssignmentIdSchema,
  assignmentRevision: CatalogMediaAssignmentRevisionSchema,
  order: CatalogMediaOrderSchema,
  purpose: CatalogMediaPurposeSchema,
  resourceRef: CatalogDocumentResourceRefSchema,
  target: Schema.Union([ProductRefSchema, VariantRefSchema]),
}).check(
  Schema.makeFilter(({ resourceRef, target }) =>
    resourceRef.tenantId === target.tenantId ? undefined : 'Assignment and Resource must share one Tenant',
  ),
);
export type CatalogMediaAssignment = typeof CatalogMediaAssignmentSchema.Type;

export interface CatalogMediaSet {
  readonly illustrativeFallback: boolean;
  readonly main: CatalogMediaAssignment | undefined;
  readonly ordered: readonly CatalogMediaAssignment[];
  readonly source: 'PRODUCT' | 'VARIANT';
}

/** Selection depends on assignment presence, never on file availability or purpose. */
export const selectCatalogMediaSet = (
  productAssignments: readonly CatalogMediaAssignment[],
  variantAssignments?: readonly CatalogMediaAssignment[],
): CatalogMediaSet => {
  const ownSet = variantAssignments !== undefined && variantAssignments.length > 0;
  const ordered = (ownSet ? (variantAssignments ?? []) : productAssignments).toSorted(
    (left, right) => left.order - right.order || left.assignmentId.localeCompare(right.assignmentId),
  );
  return {
    illustrativeFallback: variantAssignments !== undefined && !ownSet && ordered.length > 0,
    main: ordered[0],
    ordered,
    source: ownSet ? 'VARIANT' : 'PRODUCT',
  };
};

/** The owner must supply this result through its published governed read. */
export type CatalogDocumentAvailability =
  | { readonly kind: 'AVAILABLE'; readonly resourceRef: CatalogDocumentResourceRef }
  | { readonly kind: 'ABSENT'; readonly resourceRef: CatalogDocumentResourceRef }
  | { readonly kind: 'FORBIDDEN'; readonly resourceRef: CatalogDocumentResourceRef }
  | { readonly kind: 'UNAVAILABLE'; readonly resourceRef: CatalogDocumentResourceRef }
  | { readonly kind: 'CURRENT_UNVERIFIED'; readonly resourceRef: CatalogDocumentResourceRef };

export type CatalogCurrentUse =
  | { readonly assignment: CatalogMediaAssignment; readonly kind: 'AVAILABLE' }
  | { readonly assignment: CatalogMediaAssignment; readonly kind: 'OWNER_CHECK_REQUIRED' }
  | {
      readonly assignment: CatalogMediaAssignment;
      readonly kind: 'ABSENT' | 'FORBIDDEN' | 'UNAVAILABLE' | 'CURRENT_UNVERIFIED';
    };

/** Never infer Current from an assignment or silently substitute another Resource. */
export const evaluateCatalogCurrentUse = (
  assignment: CatalogMediaAssignment,
  ownerAvailability?: CatalogDocumentAvailability,
): CatalogCurrentUse => {
  if (
    ownerAvailability === undefined ||
    ownerAvailability.resourceRef.moduleId !== assignment.resourceRef.moduleId ||
    ownerAvailability.resourceRef.resourceType !== assignment.resourceRef.resourceType ||
    ownerAvailability.resourceRef.resourceId !== assignment.resourceRef.resourceId ||
    ownerAvailability.resourceRef.tenantId !== assignment.resourceRef.tenantId
  ) {
    return { assignment, kind: 'OWNER_CHECK_REQUIRED' };
  }
  return { assignment, kind: ownerAvailability.kind };
};
