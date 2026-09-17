import type { EffectiveAttributeValuesResult } from '../../shared/domain/effective-attribute-values.ts';
import type { ProductTypeCurrentValue, ProductTypeRulesResult } from '../../shared/domain/product-type-rules.ts';
import { evaluateProductTypeRules } from '../../shared/domain/product-type-rules.ts';
import type { ProductRef } from '../../shared/resources/product.ts';
import type { VariantRef } from '../../shared/resources/variant.ts';
import type { ProductTypeReadinessSource } from './product-type-readiness-source.ts';

/** A complete, owner-verified Current snapshot; callers must not construct this from browser input. */
export interface ProductTypeReadinessSnapshot {
  readonly productValues: readonly ProductTypeCurrentValue[];
  /** Owner-verified complete Product-level value inventory. No producer is wired yet. */
  readonly productValueSource?: { readonly complete: true; readonly revision: number };
  readonly source: ProductTypeReadinessSource;
  /** Exact Current Variant inventory verified by the owner in the same read transaction. */
  readonly variantRefs: readonly VariantRef[];
  readonly variants: readonly {
    /** One result per allowed Variant-level rule, including absent values. */
    readonly effectiveValues: readonly {
      readonly attributeDefinitionId: string;
      readonly result: EffectiveAttributeValuesResult;
    }[];
    readonly variantRef: VariantRef;
  }[];
}

export type ProductTypeReadinessEvaluation =
  | { readonly reason: string; readonly status: 'INDETERMINATE' }
  | {
      readonly rules: ProductTypeRulesResult;
      readonly status: 'UNTYPED_PARTIAL';
    }
  | {
      readonly assignmentRevision: number;
      readonly productValueSourceRevision: number;
      readonly rules: ProductTypeRulesResult;
      readonly rulesRevision: number;
      readonly rulesRevisionId: string;
      readonly status: 'VERIFIED_TYPE_MINIMUM' | 'INVALID';
      readonly valueRevisions: readonly {
        readonly attributeDefinitionId: string;
        readonly productRevision?: number | undefined;
        readonly variantId: string;
        readonly variantRevision?: number | undefined;
      }[];
    };

const sameRef = (left: ProductRef | VariantRef, right: ProductRef | VariantRef): boolean =>
  left.tenantId === right.tenantId && left.resourceId === right.resourceId;

const snapshotProblem = ({
  productValueSource,
  source,
  variantRefs,
  variants,
}: ProductTypeReadinessSnapshot): string | null => {
  if (
    productValueSource?.complete !== true ||
    !Number.isSafeInteger(productValueSource.revision) ||
    productValueSource.revision < 1
  ) {
    return 'Complete Current Product value source is unavailable';
  }
  const variantIds = new Set(variantRefs.map((variant) => variant.resourceId));
  if (
    variantIds.size !== variantRefs.length ||
    variants.length !== variantRefs.length ||
    variants.some(
      (variant) =>
        variant.variantRef.tenantId !== source.productRef.tenantId || !variantIds.has(variant.variantRef.resourceId),
    ) ||
    new Set(variants.map((variant) => variant.variantRef.resourceId)).size !== variants.length
  ) {
    return 'Current Variant inventory is incomplete or inconsistent';
  }
  return null;
};

/** #424 partial minimum only; no result here asserts overall #414 Catalog readiness. */
export const evaluateCurrentProductTypeReadiness = (
  snapshot: ProductTypeReadinessSnapshot,
): ProductTypeReadinessEvaluation => {
  const { productValues, productValueSource, source, variants } = snapshot;
  const problem = snapshotProblem(snapshot);
  if (problem !== null) {
    return { reason: problem, status: 'INDETERMINATE' };
  }
  if (productValueSource === undefined) {
    return { reason: 'Current Product value source is unavailable', status: 'INDETERMINATE' };
  }
  if (source.status === 'UNTYPED') {
    if (variants.some((variant) => variant.effectiveValues.length > 0)) {
      return { reason: 'Untyped Variant value authority is unavailable', status: 'INDETERMINATE' };
    }
    const rules = evaluateProductTypeRules({
      productRef: source.productRef,
      productValues,
      variants: variants.map((variant) => ({
        effectiveValues: [],
        productRef: source.productRef,
        variantRef: variant.variantRef,
      })),
    });
    return rules.basisStatus === 'UNTYPED'
      ? { rules, status: 'UNTYPED_PARTIAL' }
      : { reason: 'Untyped Product snapshot is malformed', status: 'INDETERMINATE' };
  }
  const { basis, rulesRevision } = source;
  const valueRevisions: {
    attributeDefinitionId: string;
    productRevision?: number | undefined;
    variantId: string;
    variantRevision?: number | undefined;
  }[] = [];
  const variantValues = [];
  for (const variant of variants) {
    const values: ProductTypeCurrentValue[] = [];
    const seen = new Set<string>();
    for (const value of variant.effectiveValues) {
      if (seen.has(value.attributeDefinitionId)) {
        return { reason: 'Duplicate effective Attribute Definition', status: 'INDETERMINATE' };
      }
      seen.add(value.attributeDefinitionId);
      const { result } = value;
      if (result.status !== 'CURRENT') {
        return { reason: `Effective value is ${result.status}`, status: 'INDETERMINATE' };
      }
      if (result.source !== undefined && !sameRef(result.source.productRef, source.productRef)) {
        return { reason: 'Effective value belongs to another Product', status: 'INDETERMINATE' };
      }
      if (result.source?.variantRef !== undefined && !sameRef(result.source.variantRef, variant.variantRef)) {
        return { reason: 'Effective value belongs to another Variant', status: 'INDETERMINATE' };
      }
      valueRevisions.push({
        attributeDefinitionId: value.attributeDefinitionId,
        productRevision: result.productRevision,
        variantId: variant.variantRef.resourceId,
        variantRevision: result.variantRevision,
      });
      if (result.values.length > 0) {
        values.push({
          attributeDefinitionRef: {
            moduleId: 'commerce.catalog',
            resourceId: value.attributeDefinitionId,
            resourceType: 'commerce.catalog.attribute-definition',
            tenantId: source.productRef.tenantId,
          },
          valid: true,
        });
      }
    }
    if (
      rulesRevision.rules.some((rule) => rule.level === 'VARIANT' && !seen.has(rule.attributeDefinitionRef.resourceId))
    ) {
      return { reason: 'Effective Variant rule coverage is incomplete', status: 'INDETERMINATE' };
    }
    variantValues.push({ effectiveValues: values, productRef: source.productRef, variantRef: variant.variantRef });
  }
  const rules = evaluateProductTypeRules(
    {
      currentProductTypeRef: basis.productTypeRef,
      productRef: source.productRef,
      productValues,
      variants: variantValues,
    },
    rulesRevision,
    basis,
  );
  if (rules.basisStatus !== 'CURRENT') {
    return { reason: `Product Type basis is ${rules.basisStatus}`, status: 'INDETERMINATE' };
  }
  return {
    assignmentRevision: source.assignmentRevision,
    productValueSourceRevision: productValueSource.revision,
    rules,
    rulesRevision: rulesRevision.revision,
    rulesRevisionId: rulesRevision.revisionId,
    status: rules.minimumSatisfied ? 'VERIFIED_TYPE_MINIMUM' : 'INVALID',
    valueRevisions,
  };
};
