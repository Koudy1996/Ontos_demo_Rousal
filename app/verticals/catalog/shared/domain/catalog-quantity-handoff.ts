import { Schema } from 'effect';

import { CatalogSelectionSchema } from './catalog-selection-evidence.ts';
import type { CatalogSelection, CatalogSelectionEvidence } from './catalog-selection-evidence.ts';
import type { CatalogResourceRef } from './catalog-revision-reference.ts';
import { sameCatalogRevisionReference } from './catalog-revision-reference.ts';
import type { PackageContentRevision, PackageResolution } from './package-content.ts';
import type { QuantityNormalization } from './purchase-quantity.ts';

/** Catalog product facts supplied to Commerce; no customer profile or commercial verdict. */
export type CatalogQuantityHandoff =
  | {
      readonly divisible: boolean;
      readonly evidence: Extract<CatalogSelectionEvidence, { status: 'VALID' }>;
      readonly packageContent?: Extract<PackageResolution, { status: 'VALID' }>;
      readonly packageRevision?: PackageContentRevision;
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

const sameRef = (left: CatalogResourceRef, right: CatalogResourceRef): boolean =>
  left.moduleId === right.moduleId &&
  left.resourceType === right.resourceType &&
  left.resourceId === right.resourceId &&
  left.tenantId === right.tenantId;

const matchesPackageSubject = (
  selection: CatalogSelection,
  content: Extract<PackageResolution, { status: 'VALID' }>,
  revision: PackageContentRevision,
  configurationKey: string | undefined,
): boolean =>
  sameRef(revision.form.productRef, selection.productRef) &&
  sameRef(revision.form.variantRef, selection.variantRef) &&
  sameRef(revision.unitRef, content.unitRef) &&
  revision.configurationKey === configurationKey &&
  (selection.setComposition === undefined
    ? revision.setComposition === undefined
    : revision.setComposition !== undefined &&
      sameCatalogRevisionReference(revision.setComposition, selection.setComposition));

const matchesPackage = (
  selection: CatalogSelection,
  content: Extract<PackageResolution, { status: 'VALID' }> | undefined,
  revision: PackageContentRevision | undefined,
  configurationKey: string | undefined,
): boolean => {
  if (selection.packageOption === undefined) {
    return content === undefined && revision === undefined;
  }
  if (content === undefined || revision === undefined) {
    return false;
  }
  const pinned = selection.packageOption.contentRevision;
  const [first] = content.path;
  return (
    first !== undefined &&
    sameCatalogRevisionReference(first, pinned) &&
    sameCatalogRevisionReference(revision.reference, pinned) &&
    matchesPackageSubject(selection, content, revision, configurationKey)
  );
};

interface HandoffInput {
  /** Owner-issued canonical key for the selected configuration; not inferred from display choices. */
  readonly configurationKey?: string;
  readonly divisible: boolean;
  readonly evidence: CatalogSelectionEvidence;
  readonly packageContent?: PackageResolution;
  readonly packageRevision?: PackageContentRevision;
  readonly quantity: QuantityNormalization;
  readonly selection: CatalogSelection;
  readonly unitRef: CatalogResourceRef;
}

const packageFailure = (input: HandoffInput): Exclude<CatalogQuantityHandoff, { status: 'READY' }> | null => {
  if (input.packageContent?.status === 'INVALID') {
    return { reason: input.packageContent.reason, status: 'INVALID' };
  }
  if (input.packageContent?.status === 'UNVERIFIABLE') {
    return { reason: input.packageContent.reason, status: 'UNVERIFIABLE' };
  }
  if (
    input.selection.packageOption !== undefined &&
    (input.packageContent === undefined ||
      input.packageRevision === undefined ||
      (input.selection.configuration !== undefined && input.configurationKey === undefined))
  ) {
    return { reason: 'Exact package content or configuration identity is missing', status: 'UNVERIFIABLE' };
  }
  const validPackageContent = input.packageContent?.status === 'VALID' ? input.packageContent : undefined;
  return matchesPackage(input.selection, validPackageContent, input.packageRevision, input.configurationKey)
    ? null
    : { reason: 'Package content does not match the selected exact revision', status: 'STALE' };
};

/** Assemble facts only for the same exact selection; Commerce #333 owns customer-specific rules. */
export const prepareCatalogQuantityHandoff = (input: HandoffInput): CatalogQuantityHandoff => {
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
  const failure = packageFailure(input);
  if (failure !== null) {
    return failure;
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
    return input.packageRevision === undefined
      ? { reason: 'Exact Package Content Revision is missing', status: 'UNVERIFIABLE' }
      : { ...ready, packageContent: input.packageContent, packageRevision: input.packageRevision };
  }
  return ready;
};
