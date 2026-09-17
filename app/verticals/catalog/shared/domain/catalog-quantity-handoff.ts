import { Schema } from 'effect';

import { CatalogSelectionSchema } from './catalog-selection-evidence.ts';
import type { CatalogSelection, CatalogSelectionEvidence } from './catalog-selection-evidence.ts';
import type { CatalogResourceRef } from './catalog-revision-reference.ts';
import type { PackageResolution } from './package-content.ts';
import type { QuantityNormalization } from './purchase-quantity.ts';

/** Catalog product facts supplied to Commerce; no customer profile or commercial verdict. */
export type CatalogQuantityHandoff =
  | {
      readonly divisible: boolean;
      readonly evidence: Extract<CatalogSelectionEvidence, { status: 'VALID' }>;
      readonly packageContent?: Extract<PackageResolution, { status: 'VALID' }>;
      readonly quantity: Extract<QuantityNormalization, { status: 'VALID' }>;
      readonly selection: CatalogSelection;
      readonly status: 'READY';
      readonly unitRef: CatalogResourceRef;
    }
  | { readonly reason: string; readonly status: 'INVALID' | 'UNVERIFIABLE' | 'STALE' };

const sameSelection = Schema.toEquivalence(CatalogSelectionSchema);
const matchesQuantityIdentity = (input: {
  readonly quantity: Extract<QuantityNormalization, { status: 'VALID' }>;
  readonly selection: CatalogSelection;
  readonly unitRef: CatalogResourceRef;
}): boolean =>
  input.unitRef.tenantId === input.selection.productRef.tenantId &&
  input.quantity.tenantId === input.selection.productRef.tenantId &&
  input.quantity.unitId === input.unitRef.resourceId &&
  input.quantity.targetId ===
    (input.selection.packageOption?.optionRef.resourceId ?? input.selection.variantRef.resourceId);

const matchesPackage = (selection: CatalogSelection, content: PackageResolution | undefined): boolean => {
  if (selection.packageOption === undefined) {
    return content === undefined;
  }
  if (content?.status !== 'VALID') {
    return false;
  }
  const pinned = selection.packageOption.contentRevision;
  const [first] = content.path;
  return (
    first !== undefined &&
    first.resourceRef.resourceId === pinned.resourceRef.resourceId &&
    first.resourceRef.tenantId === pinned.resourceRef.tenantId &&
    first.revision === pinned.revision &&
    first.revisionId === pinned.revisionId
  );
};

/** Assemble facts only for the same exact selection; Commerce #333 owns customer-specific rules. */
export const prepareCatalogQuantityHandoff = (input: {
  readonly divisible: boolean;
  readonly evidence: CatalogSelectionEvidence;
  readonly packageContent?: PackageResolution;
  readonly quantity: QuantityNormalization;
  readonly selection: CatalogSelection;
  readonly unitRef: CatalogResourceRef;
}): CatalogQuantityHandoff => {
  if (input.evidence.status === 'INDETERMINATE') {
    return { reason: input.evidence.reason, status: 'UNVERIFIABLE' };
  }
  if (input.evidence.status === 'INVALID') {
    return { reason: input.evidence.reason, status: 'INVALID' };
  }
  if (input.quantity.status === 'REPREPARE_REQUIRED') {
    return { reason: input.quantity.reason, status: 'STALE' };
  }
  if (input.quantity.status !== 'VALID') {
    return { reason: input.quantity.reason, status: input.quantity.status === 'INVALID' ? 'INVALID' : 'UNVERIFIABLE' };
  }
  if (!sameSelection(input.selection, input.evidence.selection)) {
    return { reason: 'Selection evidence describes a different exact selection', status: 'STALE' };
  }
  if (!matchesQuantityIdentity({ quantity: input.quantity, selection: input.selection, unitRef: input.unitRef })) {
    return { reason: 'Quantity, Unit, and selection target must agree', status: 'INVALID' };
  }
  if (!matchesPackage(input.selection, input.packageContent)) {
    return { reason: 'Package content does not match the selected exact revision', status: 'STALE' };
  }
  const ready: Extract<CatalogQuantityHandoff, { status: 'READY' }> = {
    divisible: input.divisible,
    evidence: input.evidence,
    quantity: input.quantity,
    selection: input.selection,
    status: 'READY',
    unitRef: input.unitRef,
  };
  if (input.packageContent?.status === 'VALID') {
    return { ...ready, packageContent: input.packageContent };
  }
  return ready;
};
