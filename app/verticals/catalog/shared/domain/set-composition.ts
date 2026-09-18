import { Result, Schema } from 'effect';

import { CatalogSelectionSchema, SetCompositionSelectionRevisionSchema } from './catalog-selection-evidence.ts';
import type { CatalogSelection } from './catalog-selection-evidence.ts';
import { sameCatalogRevisionReference } from './catalog-revision-reference.ts';
import type { CatalogResourceRef } from './catalog-revision-reference.ts';
import { ProductRefSchema } from '../resources/product.ts';
import { ProductUnitRefSchema } from '../resources/product-unit.ts';
import { VariantRefSchema } from '../resources/variant.ts';

const nonEmptyText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(300), Schema.isTrimmed());
const componentId = Schema.String.check(Schema.isUUID(), Schema.isTrimmed()).pipe(Schema.brand('SetComponentId'));
const positiveAmount = Schema.String.check(
  Schema.isPattern(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u),
  Schema.makeFilter((value) => (/[1-9]/u.test(value) ? undefined : 'Component Quantity must be positive')),
);

/** One stable need in one Set, not an optional or customer-selected alternative. */
const SetComponentSchema = Schema.Struct({
  componentId,
  quantity: Schema.Struct({ amount: positiveAmount, unitRef: ProductUnitRefSchema }),
  selection: CatalogSelectionSchema,
}).check(
  Schema.makeFilter(({ quantity, selection }) =>
    selection.setComposition === undefined && quantity.unitRef.tenantId === selection.productRef.tenantId
      ? undefined
      : 'Set components must be non-Set selections with a Quantity in the same Tenant',
  ),
);
export type SetComponent = typeof SetComponentSchema.Type;

/** An issued revision is never edited. Corrections also issue a new revision with provenance. */
export const SetCompositionRevisionSchema = Schema.Struct({
  components: Schema.Array(SetComponentSchema).check(Schema.isMinLength(2)),
  predecessor: Schema.optionalKey(SetCompositionSelectionRevisionSchema),
  productRef: ProductRefSchema,
  provenance: Schema.Struct({
    changeKind: Schema.Literals(['INITIAL', 'MATERIAL_CHANGE', 'EVIDENCE_CORRECTION']),
    evidenceRefs: Schema.Array(nonEmptyText),
    reason: nonEmptyText,
  }),
  reference: SetCompositionSelectionRevisionSchema,
  variantRef: VariantRefSchema,
}).check(
  Schema.makeFilter(({ components, predecessor, productRef, reference, variantRef }) => {
    const { tenantId } = productRef;
    if (reference.resourceRef.tenantId !== tenantId || variantRef.tenantId !== tenantId) {
      return 'Set Product, Variant, and composition revision must share one Tenant';
    }
    if (components.some(({ selection }) => selection.productRef.tenantId !== tenantId)) {
      return 'Set components must share the Set Tenant';
    }
    if (components.some(({ selection }) => selection.productRef.resourceId === productRef.resourceId)) {
      return 'A Set Product cannot contain itself';
    }
    if (
      predecessor !== undefined &&
      (predecessor.resourceRef.resourceId !== reference.resourceRef.resourceId ||
        predecessor.resourceRef.tenantId !== tenantId ||
        predecessor.revision >= reference.revision ||
        sameCatalogRevisionReference(predecessor, reference))
    ) {
      return 'A predecessor must be an older revision of the same Set Composition Resource';
    }
    return new Set(components.map(({ componentId: id }) => id)).size === components.length
      ? undefined
      : 'Set component identities must be unique within a revision';
  }),
);
export type SetCompositionRevision = typeof SetCompositionRevisionSchema.Type;

const sameSelection = Schema.toEquivalence(CatalogSelectionSchema);
const sameUnit = (left: CatalogResourceRef, right: CatalogResourceRef): boolean =>
  left.moduleId === right.moduleId &&
  left.resourceType === right.resourceType &&
  left.resourceId === right.resourceId &&
  left.tenantId === right.tenantId;

interface Decimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

const decimal = (amount: string): Decimal => {
  const [whole = '', fraction = ''] = amount.split('.');
  return { coefficient: BigInt(`${whole}${fraction}`), scale: fraction.length };
};

const format = ({ coefficient, scale }: Decimal): string => {
  if (scale === 0) {
    return coefficient.toString();
  }
  const padded = coefficient.toString().padStart(scale + 1, '0');
  const fractional = padded.slice(-scale).replace(/0+$/u, '');
  return fractional.length === 0 ? padded.slice(0, -scale) : `${padded.slice(0, -scale)}.${fractional}`;
};

/** Evidence-only corrections can preserve actual content; changed component meaning cannot. */
export const classifySetCompositionChange = (
  previous: SetCompositionRevision,
  next: SetCompositionRevision,
): 'SAME_CONTENT' | 'MATERIAL_CHANGE' | 'EVIDENCE_CORRECTION' => {
  if (previous.components.length !== next.components.length) {
    return 'MATERIAL_CHANGE';
  }
  // Component IDs identify recorded needs, not the goods delivered by the Set.
  // Match as a multiset so re-keying a need is not mistaken for changed content,
  // while repeated identical needs still have to match one-for-one.
  const unmatched = [...previous.components];
  const sameContent = next.components.every((component) => {
    const index = unmatched.findIndex(
      (prior) =>
        sameSelection(prior.selection, component.selection) &&
        sameUnit(prior.quantity.unitRef, component.quantity.unitRef) &&
        format(decimal(prior.quantity.amount)) === format(decimal(component.quantity.amount)),
    );
    if (index === -1) {
      return false;
    }
    unmatched.splice(index, 1);
    return true;
  });
  if (sameContent) {
    return 'SAME_CONTENT';
  }
  // A correction of a recorded amount is not a change to the actual assortment.
  // Require an explicit original-data-error evidence reference and exact R1 -> R2
  // lineage; prose reason or the requested change kind alone cannot assert this.
  const isExactSuccessor =
    next.predecessor !== undefined &&
    sameCatalogRevisionReference(next.predecessor, previous.reference) &&
    next.reference.revision === previous.reference.revision + 1 &&
    next.reference.resourceRef.resourceId === previous.reference.resourceRef.resourceId;
  const hasOriginalDataErrorEvidence = next.provenance.evidenceRefs.some((ref) =>
    ref.startsWith('original-data-error:'),
  );
  const quantityOnly = next.components.every((component) => {
    const prior = previous.components.find((item) => item.componentId === component.componentId);
    return (
      prior !== undefined &&
      sameSelection(prior.selection, component.selection) &&
      sameUnit(prior.quantity.unitRef, component.quantity.unitRef)
    );
  });
  return next.provenance.changeKind === 'EVIDENCE_CORRECTION' &&
    isExactSuccessor &&
    hasOriginalDataErrorEvidence &&
    quantityOnly
    ? 'EVIDENCE_CORRECTION'
    : 'MATERIAL_CHANGE';
};

const add = (left: Decimal, right: Decimal): Decimal => {
  const scale = Math.max(left.scale, right.scale);
  return {
    coefficient:
      left.coefficient * 10n ** BigInt(scale - left.scale) + right.coefficient * 10n ** BigInt(scale - right.scale),
    scale,
  };
};

const multiply = (left: Decimal, right: Decimal): Decimal => ({
  coefficient: left.coefficient * right.coefficient,
  scale: left.scale + right.scale,
});

/** Scale one Set's exact needs by ordered Set Quantity; only identical selections and Units combine. */
export const summarizeSetComponents = (components: readonly SetComponent[], orderedSetQuantity: string) =>
  Result.map(Schema.decodeResult(positiveAmount)(orderedSetQuantity), (validQuantity) => {
    const orderQuantity = decimal(validQuantity);
    const totals: {
      amount: Decimal;
      componentIds: string[];
      selection: CatalogSelection;
      unitRef: CatalogResourceRef;
    }[] = [];
    for (const component of components) {
      const match = totals.find(
        (total) =>
          sameSelection(total.selection, component.selection) && sameUnit(total.unitRef, component.quantity.unitRef),
      );
      if (match === undefined) {
        totals.push({
          amount: decimal(component.quantity.amount),
          componentIds: [component.componentId],
          selection: component.selection,
          unitRef: component.quantity.unitRef,
        });
      } else {
        match.amount = add(match.amount, decimal(component.quantity.amount));
        match.componentIds.push(component.componentId);
      }
    }
    return totals.map((total) => ({ ...total, amount: format(multiply(total.amount, orderQuantity)) }));
  });
