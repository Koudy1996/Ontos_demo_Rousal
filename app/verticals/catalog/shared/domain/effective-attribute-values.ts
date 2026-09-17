import { Schema } from 'effect';

import type { ProductRef } from '../resources/product.ts';
import type { VariantRef } from '../resources/variant.ts';
import type { AttributeDefinition, AttributeValue, UnitConversion } from './attribute-values.ts';
import { AttributeDefinitionSchema, validateAttributeValues } from './attribute-values.ts';
import type { ProductTypeCurrentBasis, ProductTypeCurrentRulesRevision } from './product-type-rules.ts';
import { ProductTypeCurrentBasisSchema, ProductTypeCurrentRulesRevisionSchema } from './product-type-rules.ts';

/** SET always contains an explicit nonempty answer; REMOVED is a tombstone, not a special value. */
export interface AttributeValueSetSnapshot {
  readonly state: 'SET' | 'REMOVED';
  readonly revision: number;
  readonly values: readonly AttributeValue[];
}

export interface AttributeValueSource {
  readonly level: 'PRODUCT' | 'VARIANT';
  readonly revision: number;
  readonly productRef: ProductRef;
  readonly variantRef?: VariantRef;
}

export type EffectiveAttributeValuesResult =
  | {
      readonly status: 'CURRENT';
      readonly values: readonly AttributeValue[];
      readonly source?: AttributeValueSource;
      readonly productRevision?: number | undefined;
      readonly variantRevision?: number | undefined;
    }
  | { readonly status: 'INVALID_AUTHORITY' | 'INVALID_VALUE' | 'STALE_BASIS'; readonly reasons: readonly string[] };

const sameRef = (
  left: { readonly tenantId: string; readonly resourceId: string },
  right: { readonly tenantId: string; readonly resourceId: string },
): boolean => left.tenantId === right.tenantId && left.resourceId === right.resourceId;

/**
 * Resolve one definition on one Variant from a single owner-supplied Current snapshot.
 * The caller must load and lock the relevant revisions and enforce the Action/Permission boundary.
 */
export const resolveEffectiveAttributeValues = (input: {
  readonly basis?: ProductTypeCurrentBasis;
  readonly definition: AttributeDefinition;
  readonly productRef: ProductRef;
  /** Owner-verified parent identity of this recorded Variant. */
  readonly variantProductRef: ProductRef;
  /** null means the owner verified that no set exists. */
  readonly productSet: AttributeValueSetSnapshot | null;
  readonly rulesRevision?: ProductTypeCurrentRulesRevision;
  readonly variantRef: VariantRef;
  readonly variantSet: AttributeValueSetSnapshot | null;
  /** The revisions displayed when a removal was requested; mismatch rejects stale fallback. */
  readonly removalBasis?: { readonly productRevision?: number; readonly variantRevision: number };
  readonly conversions?: readonly UnitConversion[];
}): EffectiveAttributeValuesResult => {
  const { basis, definition, productRef, productSet, rulesRevision, variantRef, variantSet } = input;
  if (
    basis === undefined ||
    rulesRevision === undefined ||
    !Schema.is(ProductTypeCurrentBasisSchema)(basis) ||
    !Schema.is(ProductTypeCurrentRulesRevisionSchema)(rulesRevision) ||
    !Schema.is(AttributeDefinitionSchema)(definition) ||
    !sameRef(productRef, input.variantProductRef) ||
    productRef.tenantId !== variantRef.tenantId ||
    definition.ref.tenantId !== productRef.tenantId ||
    basis.productTypeRef.tenantId !== productRef.tenantId ||
    !sameRef(basis.productTypeRef, rulesRevision.productTypeRef) ||
    basis.revision !== rulesRevision.revision ||
    basis.currentRevision !== rulesRevision.revision ||
    basis.revisionId !== rulesRevision.revisionId ||
    basis.effectiveFrom !== rulesRevision.effectiveFrom ||
    basis.evaluatedAt < basis.effectiveFrom ||
    (basis.effectiveUntil !== undefined && basis.evaluatedAt >= basis.effectiveUntil) ||
    !definition.levels.includes('VARIANT') ||
    !rulesRevision.rules.some(
      (rule) =>
        rule.level === 'VARIANT' &&
        rule.attributeDefinitionRef.tenantId === definition.ref.tenantId &&
        rule.attributeDefinitionRef.resourceId === definition.ref.resourceId,
    )
  ) {
    return { status: 'INVALID_AUTHORITY', reasons: ['Missing or inconsistent Current Variant applicability'] };
  }

  const inheritable =
    definition.levels.includes('PRODUCT') &&
    rulesRevision.rules.some(
      (rule) =>
        rule.level === 'PRODUCT' &&
        rule.attributeDefinitionRef.tenantId === definition.ref.tenantId &&
        rule.attributeDefinitionRef.resourceId === definition.ref.resourceId,
    );
  const validSet = (set: AttributeValueSetSnapshot | null): boolean =>
    set === null ||
    (Number.isInteger(set.revision) &&
      set.revision > 0 &&
      (set.state === 'SET' ? set.values.length > 0 : set.state === 'REMOVED' && set.values.length === 0));
  if (!validSet(productSet) || !validSet(variantSet) || (productSet?.state === 'SET' && !inheritable)) {
    return { status: 'INVALID_AUTHORITY', reasons: ['Invalid value-set state or disallowed Product value'] };
  }
  if (input.removalBasis !== undefined) {
    if (
      variantSet?.state !== 'REMOVED' ||
      input.removalBasis.variantRevision !== variantSet.revision ||
      input.removalBasis.productRevision !== (productSet?.revision ?? undefined)
    ) {
      return { status: 'STALE_BASIS', reasons: ['Value source changed before override removal'] };
    }
  }
  const selected =
    variantSet?.state === 'SET' ? variantSet : inheritable && productSet?.state === 'SET' ? productSet : undefined;
  if (selected === undefined)
    return {
      status: 'CURRENT',
      values: [],
      productRevision: productSet?.revision,
      variantRevision: variantSet?.revision,
    };
  const checked = validateAttributeValues(definition, selected.values, input.conversions);
  if (!checked.valid) return { status: 'INVALID_VALUE', reasons: checked.reasons };
  const source: AttributeValueSource =
    selected === variantSet
      ? { level: 'VARIANT', revision: selected.revision, productRef, variantRef }
      : { level: 'PRODUCT', revision: selected.revision, productRef };
  return {
    status: 'CURRENT',
    values: checked.normalized,
    source,
    productRevision: productSet?.revision,
    variantRevision: variantSet?.revision,
  };
};
