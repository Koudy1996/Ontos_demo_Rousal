/** Pure, owner-private assessment of a proposed Product Type rule change. */
export interface ProductTypeImpactRule {
  readonly attributeDefinitionId: string;
  readonly level: 'PRODUCT' | 'VARIANT';
  readonly required: boolean;
}

export interface ProductTypeImpactValue {
  readonly attributeDefinitionId: string;
}

export interface ProductTypeImpactVariant {
  readonly values: readonly ProductTypeImpactValue[];
  readonly variantId: string;
}

export interface ProductTypeImpactProduct {
  readonly productId: string;
  readonly values: readonly ProductTypeImpactValue[];
  readonly variantAxes: readonly string[];
  readonly variants: readonly ProductTypeImpactVariant[];
}

export interface ProductTypeImpactSubject {
  readonly affectedVariantAxes: readonly string[];
  readonly catalogReadyForAffectedUse: boolean;
  readonly disallowedCurrentValues: readonly string[];
  readonly missingRequired: readonly string[];
  readonly productId: string;
  readonly variantId?: string;
}

export interface ProductTypeImpactPreview {
  readonly affectedProductIds: readonly string[];
  readonly requiresExplicitRemediation: boolean;
  readonly subjects: readonly ProductTypeImpactSubject[];
}

const uniqueSorted = (values: readonly string[]): string[] => [...new Set(values)].toSorted();

/**
 * `nextRules === null` means type removal, not permission for free-form values.
 * The caller must supply the complete, unchanged population and Current values;
 * this function grants neither permission nor authority to apply its preview.
 */
export const previewProductTypeImpact = (
  products: readonly ProductTypeImpactProduct[],
  nextRules: readonly ProductTypeImpactRule[] | null,
): ProductTypeImpactPreview => {
  const rules = nextRules ?? [];
  const allowed = new Set(rules.map((rule) => `${rule.level}:${rule.attributeDefinitionId}`));
  const requiredProduct: string[] = [];
  const requiredVariant: string[] = [];
  for (const rule of rules) {
    if (!rule.required) {
      continue;
    }
    (rule.level === 'PRODUCT' ? requiredProduct : requiredVariant).push(rule.attributeDefinitionId);
  }
  const subjects: ProductTypeImpactSubject[] = [];

  for (const product of products) {
    const productValues = new Set(product.values.map((value) => value.attributeDefinitionId));
    const productMissing = uniqueSorted(requiredProduct.filter((id) => !productValues.has(id)));
    const productDisallowedValues: string[] = [];
    for (const value of product.values) {
      if (!allowed.has(`PRODUCT:${value.attributeDefinitionId}`)) {
        productDisallowedValues.push(value.attributeDefinitionId);
      }
    }
    const productDisallowed = uniqueSorted(productDisallowedValues);
    const affectedVariantAxes = uniqueSorted(product.variantAxes.filter((id) => !allowed.has(`VARIANT:${id}`)));
    const productAffected = productMissing.length > 0 || productDisallowed.length > 0 || affectedVariantAxes.length > 0;
    if (productAffected) {
      subjects.push({
        affectedVariantAxes,
        catalogReadyForAffectedUse: false,
        disallowedCurrentValues: productDisallowed,
        missingRequired: productMissing,
        productId: product.productId,
      });
    }

    for (const variant of product.variants) {
      const variantValues = new Set(variant.values.map((value) => value.attributeDefinitionId));
      const missingRequired = requiredVariant.filter((id) => !variantValues.has(id));
      const disallowedValues: string[] = [];
      for (const value of variant.values) {
        if (!allowed.has(`VARIANT:${value.attributeDefinitionId}`)) {
          disallowedValues.push(value.attributeDefinitionId);
        }
      }
      const disallowedCurrentValues = uniqueSorted(disallowedValues);
      if (productAffected || missingRequired.length > 0 || disallowedCurrentValues.length > 0) {
        subjects.push({
          affectedVariantAxes,
          catalogReadyForAffectedUse: false,
          disallowedCurrentValues,
          missingRequired,
          productId: product.productId,
          variantId: variant.variantId,
        });
      }
    }
  }

  return {
    affectedProductIds: uniqueSorted(subjects.map((subject) => subject.productId)),
    requiresExplicitRemediation: subjects.length > 0,
    subjects,
  };
};

export interface ProductTypeEffectiveRevision {
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly revisionId: string;
}

export type ProductTypeRevisionResolution =
  | { readonly status: 'NONE' }
  | { readonly revisionId: string; readonly status: 'CURRENT' }
  | { readonly revisionIds: readonly string[]; readonly status: 'AMBIGUOUS' };

/** Inclusive start, exclusive end; overlap fails closed instead of choosing the last write. */
export const resolveCurrentProductTypeRevision = (
  revisions: readonly ProductTypeEffectiveRevision[],
  at: string,
): ProductTypeRevisionResolution => {
  const current = revisions.filter(
    (revision) => revision.effectiveFrom <= at && (revision.effectiveTo === null || at < revision.effectiveTo),
  );
  if (current.length === 0) {
    return { status: 'NONE' };
  }
  const [first] = current;
  if (current.length === 1 && first !== undefined) {
    return { revisionId: first.revisionId, status: 'CURRENT' };
  }
  return { revisionIds: uniqueSorted(current.map((revision) => revision.revisionId)), status: 'AMBIGUOUS' };
};
