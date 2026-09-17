import { Schema } from 'effect';

import { ProductRefSchema } from '../resources/product.ts';
import { ProductTypeRefSchema } from '../resources/product-type.ts';
import { VariantRefSchema } from '../resources/variant.ts';
import { CatalogResourceRefSchema, CatalogRevisionNumberSchema } from './catalog-revision-reference.ts';

/** The Definition resource is owned by #402; a type only references its identity. */
const AttributeDefinitionRefSchema = CatalogResourceRefSchema.check(
  Schema.makeFilter((ref) =>
    ref.resourceType === 'commerce.catalog.attribute-definition'
      ? undefined
      : 'Product Type rules must reference an Attribute Definition',
  ),
);

export const ProductTypeAttributeRuleSchema = Schema.Struct({
  attributeDefinitionRef: AttributeDefinitionRefSchema,
  level: Schema.Literals(['PRODUCT', 'VARIANT']),
  required: Schema.Boolean,
});
export type ProductTypeAttributeRule = typeof ProductTypeAttributeRuleSchema.Type;

/** Exact immutable rules; optional is represented by required=false, never an inferred default. */
export const ProductTypeRulesRevisionSchema = Schema.Struct({
  productTypeRef: ProductTypeRefSchema,
  revision: CatalogRevisionNumberSchema,
  rules: Schema.Array(ProductTypeAttributeRuleSchema),
}).check(
  Schema.makeFilter(({ productTypeRef, rules }) => {
    const keys = new Set<string>();
    for (const rule of rules) {
      if (rule.attributeDefinitionRef.tenantId !== productTypeRef.tenantId) {
        return 'Attribute Definitions must belong to the Product Type Tenant';
      }
      const key = `${rule.level}:${rule.attributeDefinitionRef.resourceId}`;
      if (keys.has(key)) {
        return 'A Product Type revision cannot repeat an Attribute Definition at one level';
      }
      keys.add(key);
    }
    return keys.size === rules.length
      ? undefined
      : 'A Product Type revision cannot repeat an Attribute Definition at one level';
  }),
);
export type ProductTypeRulesRevision = typeof ProductTypeRulesRevisionSchema.Type;

export const ProductTypeCurrentValueSchema = Schema.Struct({
  attributeDefinitionRef: AttributeDefinitionRefSchema,
  /** #402 validates shape, unit and business values; an invalid optional value still fails. */
  valid: Schema.Boolean,
});
export type ProductTypeCurrentValue = typeof ProductTypeCurrentValueSchema.Type;

export const ProductTypeVariantValuesSchema = Schema.Struct({
  /** Inheritance is included here only after #429/#430 explicitly permit and validate it. */
  effectiveValues: Schema.Array(ProductTypeCurrentValueSchema),
  variantRef: VariantRefSchema,
});
export type ProductTypeVariantValues = typeof ProductTypeVariantValuesSchema.Type;

export const ProductTypeSubjectSchema = Schema.Struct({
  currentProductTypeRef: Schema.optionalKey(ProductTypeRefSchema),
  productRef: ProductRefSchema,
  productValues: Schema.Array(ProductTypeCurrentValueSchema),
  variants: Schema.Array(ProductTypeVariantValuesSchema),
}).check(
  Schema.makeFilter(({ currentProductTypeRef, productRef, productValues, variants }) =>
    (currentProductTypeRef === undefined || currentProductTypeRef.tenantId === productRef.tenantId) &&
    productValues.every((value) => value.attributeDefinitionRef.tenantId === productRef.tenantId) &&
    variants.every(
      (variant) =>
        variant.variantRef.tenantId === productRef.tenantId &&
        variant.effectiveValues.every((value) => value.attributeDefinitionRef.tenantId === productRef.tenantId),
    )
      ? undefined
      : 'Product Type subject, values, and Variants must belong to one Tenant',
  ),
);
export type ProductTypeSubject = typeof ProductTypeSubjectSchema.Type;

export interface ProductTypeViolation {
  readonly attributeDefinitionId: string;
  readonly kind: 'DISALLOWED' | 'INVALID' | 'MISSING_REQUIRED';
  readonly level: 'PRODUCT' | 'VARIANT';
  variantId?: string;
}

export interface ProductTypeRulesResult {
  readonly minimumSatisfied: boolean;
  readonly revision: number | undefined;
  readonly violations: readonly ProductTypeViolation[];
}

/** Evaluates only Product Type minimum, never overall Catalog readiness or purchasing permission. */
export const evaluateProductTypeRules = (
  subject: ProductTypeSubject,
  rulesRevision?: ProductTypeRulesRevision,
): ProductTypeRulesResult => {
  const violations: ProductTypeViolation[] = [];
  const activeRevision =
    rulesRevision !== undefined &&
    subject.currentProductTypeRef !== undefined &&
    rulesRevision.productTypeRef.resourceId === subject.currentProductTypeRef.resourceId &&
    rulesRevision.productTypeRef.tenantId === subject.currentProductTypeRef.tenantId &&
    rulesRevision.productTypeRef.tenantId === subject.productRef.tenantId
      ? rulesRevision
      : undefined;
  const rules = activeRevision?.rules ?? [];
  const inspect = (
    level: 'PRODUCT' | 'VARIANT',
    values: readonly ProductTypeCurrentValue[],
    variantId?: string,
  ): void => {
    const allowed = rules.filter((rule) => rule.level === level);
    for (const value of values) {
      const attributeDefinitionId = value.attributeDefinitionRef.resourceId;
      if (
        value.attributeDefinitionRef.tenantId !== subject.productRef.tenantId ||
        !allowed.some((rule) => rule.attributeDefinitionRef.resourceId === attributeDefinitionId)
      ) {
        const violation: ProductTypeViolation = {
          attributeDefinitionId,
          kind: 'DISALLOWED',
          level,
        };
        if (variantId !== undefined) {
          violation.variantId = variantId;
        }
        violations.push(violation);
      } else if (!value.valid) {
        const violation: ProductTypeViolation = {
          attributeDefinitionId,
          kind: 'INVALID',
          level,
        };
        if (variantId !== undefined) {
          violation.variantId = variantId;
        }
        violations.push(violation);
      }
    }
    for (const rule of allowed) {
      if (
        rule.required &&
        !values.some(
          (value) => value.attributeDefinitionRef.resourceId === rule.attributeDefinitionRef.resourceId && value.valid,
        )
      ) {
        const violation: ProductTypeViolation = {
          attributeDefinitionId: rule.attributeDefinitionRef.resourceId,
          kind: 'MISSING_REQUIRED',
          level,
        };
        if (variantId !== undefined) {
          violation.variantId = variantId;
        }
        violations.push(violation);
      }
    }
  };
  inspect('PRODUCT', subject.productValues);
  for (const variant of subject.variants) {
    inspect('VARIANT', variant.effectiveValues, variant.variantRef.resourceId);
  }
  return {
    minimumSatisfied:
      violations.length === 0 && (subject.currentProductTypeRef === undefined || activeRevision !== undefined),
    revision: activeRevision?.revision,
    violations,
  };
};
