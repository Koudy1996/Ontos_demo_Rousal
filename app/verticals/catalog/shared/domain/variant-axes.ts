import { Schema } from 'effect';

import type { AttributeDefinition, AttributeValue, UnitConversion } from './attribute-values.ts';
import { validateAttributeValues } from './attribute-values.ts';
import type { ProductTypeAttributeRule } from './product-type-rules.ts';
import type { ProductVariant } from './product.ts';

type DefinitionRef = AttributeDefinition['ref'];

export interface VariantAxis {
  readonly attributeDefinitionRef: DefinitionRef;
  /** Exact definition rules used to interpret this Product's axis. */
  readonly definitionRevision: number;
}

export interface VariantAxisDefinitionSnapshot {
  readonly definition: AttributeDefinition;
  readonly revision: number;
}

export interface VariantAxisValue {
  readonly attributeDefinitionRef: DefinitionRef;
  readonly values: readonly AttributeValue[];
}

export interface VariantAxisCandidate {
  /** Effective values must already include only inheritance authorized by #429/#430. */
  readonly effectiveAxisValues: readonly VariantAxisValue[];
  readonly variant: ProductVariant;
}

export const VariantAxisIssueKindSchema = Schema.Literals([
  'DUPLICATE_AXIS',
  'DISALLOWED_AXIS',
  'MISSING_DEFINITION',
  'STALE_DEFINITION',
  'MISSING_AXIS',
  'DUPLICATE_AXIS_VALUE',
  'INVALID_VALUE',
  'UNVERIFIABLE_VALUE',
  'DUPLICATE_COMBINATION',
  'WRONG_PRODUCT',
]);
export type VariantAxisIssueKind = typeof VariantAxisIssueKindSchema.Type;

export interface VariantAxisIssue {
  readonly attributeDefinitionId?: string;
  readonly conflictingVariantId?: string;
  readonly kind: VariantAxisIssueKind;
  readonly variantId?: string;
}

export interface VariantAxesResult {
  readonly issues: readonly VariantAxisIssue[];
  readonly valid: boolean;
}

const sameRef = (left: DefinitionRef, right: DefinitionRef): boolean =>
  left.tenantId === right.tenantId && left.resourceId === right.resourceId;

const stableParts = (parts: readonly string[]): string => parts.map((part) => `${part.length}:${part}`).join('');

const valueKey = (value: AttributeValue): string => {
  if (value.kind === 'CONTROLLED') {
    return stableParts(['controlled', value.valueRef.tenantId, value.valueRef.resourceId]);
  }
  if (value.kind === 'MEASUREMENT') {
    return stableParts(['measurement', String(value.amount), value.unit]);
  }
  if (value.kind === 'SPECIAL') {
    return stableParts(['special', value.state]);
  }
  return stableParts(['text', value.text]);
};

type AxisInspection =
  | { readonly issue: VariantAxisIssue; readonly key?: never }
  | { readonly issue?: never; readonly key: string };

const inspectAxisValue = (
  axis: VariantAxis,
  candidate: VariantAxisCandidate,
  definitions: readonly VariantAxisDefinitionSnapshot[],
  conversions: readonly UnitConversion[] | undefined,
  allowedValue: ((definition: AttributeDefinition, value: AttributeValue) => boolean | undefined) | undefined,
): AxisInspection => {
  const id = axis.attributeDefinitionRef.resourceId;
  const variantId = candidate.variant.variantRef.resourceId;
  const matches = candidate.effectiveAxisValues.filter((item) =>
    sameRef(item.attributeDefinitionRef, axis.attributeDefinitionRef),
  );
  const [match] = matches;
  if (matches.length > 1) {
    return { issue: { attributeDefinitionId: id, kind: 'DUPLICATE_AXIS_VALUE', variantId } };
  }
  if (match === undefined || match.values.length === 0) {
    return { issue: { attributeDefinitionId: id, kind: 'MISSING_AXIS', variantId } };
  }
  const matchingDefinitions = definitions.filter((item) => sameRef(item.definition.ref, axis.attributeDefinitionRef));
  const [snapshot] = matchingDefinitions;
  if (matchingDefinitions.length !== 1 || snapshot === undefined) {
    return { issue: { attributeDefinitionId: id, kind: 'MISSING_DEFINITION', variantId } };
  }
  if (snapshot.revision !== axis.definitionRevision) {
    return { issue: { attributeDefinitionId: id, kind: 'STALE_DEFINITION', variantId } };
  }
  const { definition } = snapshot;
  const checked = validateAttributeValues(definition, match.values, conversions);
  const keys = checked.normalized.map(valueKey);
  if (
    !checked.valid ||
    checked.normalized.length !== match.values.length ||
    checked.normalized.some((value) => value.kind === 'SPECIAL' && value.state === 'UNKNOWN') ||
    new Set(keys).size !== keys.length
  ) {
    return { issue: { attributeDefinitionId: id, kind: 'INVALID_VALUE', variantId } };
  }
  if (allowedValue === undefined) {
    return { issue: { attributeDefinitionId: id, kind: 'UNVERIFIABLE_VALUE', variantId } };
  }
  const decisions = checked.normalized.map((value) => allowedValue(definition, value));
  if (decisions.some((decision) => decision === undefined)) {
    return { issue: { attributeDefinitionId: id, kind: 'UNVERIFIABLE_VALUE', variantId } };
  }
  if (decisions.some((decision) => decision === false)) {
    return { issue: { attributeDefinitionId: id, kind: 'INVALID_VALUE', variantId } };
  }
  return { key: stableParts([axis.attributeDefinitionRef.tenantId, id, ...keys.toSorted()]) };
};

const inspectAxisDefinition = (
  axis: VariantAxis,
  definitions: readonly VariantAxisDefinitionSnapshot[],
  productTenantId: string,
  variantRuleIds: ReadonlySet<string>,
): VariantAxisIssue | undefined => {
  const id = axis.attributeDefinitionRef.resourceId;
  const key = stableParts([axis.attributeDefinitionRef.tenantId, id]);
  const matches = definitions.filter((item) => sameRef(item.definition.ref, axis.attributeDefinitionRef));
  const [snapshot] = matches;
  if (matches.length !== 1 || snapshot === undefined || snapshot.definition.ref.tenantId !== productTenantId) {
    return { attributeDefinitionId: id, kind: 'MISSING_DEFINITION' };
  }
  if (
    !Number.isSafeInteger(axis.definitionRevision) ||
    axis.definitionRevision < 1 ||
    snapshot.revision !== axis.definitionRevision
  ) {
    return { attributeDefinitionId: id, kind: 'STALE_DEFINITION' };
  }
  if (!new Set(snapshot.definition.levels).has('VARIANT') || !variantRuleIds.has(key)) {
    return { attributeDefinitionId: id, kind: 'DISALLOWED_AXIS' };
  }
  return undefined;
};

/**
 * Pure snapshot check. The caller must supply the Current Product Type rules,
 * definitions, allowed-value evidence, and a concurrency-safe write boundary.
 * This helper neither creates a Variant nor certifies Current selectability.
 */
export const evaluateVariantAxes = (input: {
  readonly axes: readonly VariantAxis[];
  readonly candidates: readonly VariantAxisCandidate[];
  readonly conversions?: readonly UnitConversion[];
  readonly definitions: readonly VariantAxisDefinitionSnapshot[];
  /** Predicate from the authoritative allowed-value snapshot; undefined means unverified. */
  readonly isAllowedValue?: (definition: AttributeDefinition, value: AttributeValue) => boolean | undefined;
  readonly productRef: ProductVariant['productRef'];
  readonly productTypeRules: readonly ProductTypeAttributeRule[];
}): VariantAxesResult => {
  const issues: VariantAxisIssue[] = [];
  const axisIds = new Set<string>();
  const variantRuleIds = new Set<string>();
  for (const rule of input.productTypeRules) {
    if (rule.level === 'VARIANT') {
      variantRuleIds.add(stableParts([rule.attributeDefinitionRef.tenantId, rule.attributeDefinitionRef.resourceId]));
    }
  }
  for (const axis of input.axes) {
    const id = axis.attributeDefinitionRef.resourceId;
    const key = stableParts([axis.attributeDefinitionRef.tenantId, id]);
    if (axisIds.has(key)) {
      issues.push({ attributeDefinitionId: id, kind: 'DUPLICATE_AXIS' });
    }
    axisIds.add(key);
    const definitionIssue = inspectAxisDefinition(axis, input.definitions, input.productRef.tenantId, variantRuleIds);
    if (definitionIssue !== undefined) {
      issues.push(definitionIssue);
    }
  }

  const signatures = new Map<string, string>();
  for (const candidate of input.candidates.filter((item) => item.variant.lifecycle === 'ACTIVE')) {
    const { variant } = candidate;
    const variantId = variant.variantRef.resourceId;
    if (
      variant.productRef.resourceId !== input.productRef.resourceId ||
      variant.productRef.tenantId !== input.productRef.tenantId ||
      variant.variantRef.tenantId !== input.productRef.tenantId
    ) {
      issues.push({ kind: 'WRONG_PRODUCT', variantId });
    } else {
      const axisResults = input.axes.map((axis) =>
        inspectAxisValue(axis, candidate, input.definitions, input.conversions, input.isAllowedValue),
      );
      issues.push(...axisResults.flatMap((result) => (result.issue === undefined ? [] : [result.issue])));
      const extraValue = candidate.effectiveAxisValues.some(
        (item) =>
          !axisIds.has(stableParts([item.attributeDefinitionRef.tenantId, item.attributeDefinitionRef.resourceId])),
      );
      if (extraValue) {
        issues.push({ kind: 'INVALID_VALUE', variantId });
      }
      if (axisResults.every((result) => result.key !== undefined) && !extraValue) {
        const key = stableParts(
          axisResults.flatMap((result) => (result.key === undefined ? [] : [result.key])).toSorted(),
        );
        const conflictingVariantId = signatures.get(key);
        if (conflictingVariantId !== undefined && conflictingVariantId !== variantId) {
          issues.push({ conflictingVariantId, kind: 'DUPLICATE_COMBINATION', variantId });
        } else {
          signatures.set(key, variantId);
        }
      }
    }
  }
  return { issues, valid: issues.length === 0 };
};
