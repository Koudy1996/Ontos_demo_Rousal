import { Schema } from 'effect';

import {
  AttributeDefinitionSchema,
  AttributeValueSchema,
  assessDefinitionRuleChange,
  validateAttributeValues,
} from './attribute-values.ts';
import type { AttributeDefinition, AttributeValue, UnitConversion } from './attribute-values.ts';

export interface EvidencedAttributeValue {
  /** The immutable value as recorded under the previous definition rules. */
  readonly original: AttributeValue | null;
  /** Evidence for the unit and origin of this specific recorded value. */
  readonly provenance: string | null;
}

export type AttributeUnitChangeAssessment =
  | { readonly kind: 'NEW_DEFINITION_REQUIRED'; readonly reasons: readonly string[] }
  | { readonly kind: 'INDETERMINATE'; readonly reasons: readonly string[] }
  | { readonly kind: 'REMEDIATION_REQUIRED'; readonly reasons: readonly string[] }
  | {
      readonly converted: readonly AttributeValue[];
      readonly kind: 'CONVERTIBLE';
      readonly originals: readonly AttributeValue[];
    };

/** Assess one fully enumerated subject; this does not establish impact completeness or write Current. */
export const assessAttributeUnitChange = (
  current: AttributeDefinition,
  proposed: AttributeDefinition,
  recorded: readonly EvidencedAttributeValue[],
  conversions: readonly UnitConversion[],
): AttributeUnitChangeAssessment => {
  if (!Schema.is(AttributeDefinitionSchema)(current) || !Schema.is(AttributeDefinitionSchema)(proposed)) {
    return { kind: 'NEW_DEFINITION_REQUIRED', reasons: ['Invalid definition'] };
  }
  const definitionChange = assessDefinitionRuleChange(current, proposed);
  if (definitionChange.kind === 'NEW_DEFINITION_REQUIRED' || current.valueKind !== 'MEASUREMENT') {
    return { kind: 'NEW_DEFINITION_REQUIRED', reasons: definitionChange.reasons };
  }
  if (recorded.length === 0 || recorded.some(({ original }) => original === null)) {
    return { kind: 'INDETERMINATE', reasons: ['Recorded value is absent'] };
  }
  if (recorded.some(({ provenance }) => provenance === null || provenance.trim().length === 0)) {
    return { kind: 'INDETERMINATE', reasons: ['Unit or value provenance is unknown'] };
  }
  const originals = recorded.map(({ original }) => original);
  if (originals.some((value) => !Schema.is(AttributeValueSchema)(value))) {
    return { kind: 'INDETERMINATE', reasons: ['Recorded value is malformed'] };
  }
  if (originals.some((value) => value?.kind !== 'MEASUREMENT')) {
    return { kind: 'INDETERMINATE', reasons: ['Recorded measurement is not established'] };
  }
  const previous = validateAttributeValues(current, originals);
  if (!previous.valid) {
    return { kind: 'INDETERMINATE', reasons: previous.reasons };
  }
  const next = validateAttributeValues(proposed, originals, conversions);
  if (!next.valid) {
    return { kind: 'REMEDIATION_REQUIRED', reasons: next.reasons };
  }
  return { converted: next.normalized, kind: 'CONVERTIBLE', originals: previous.normalized };
};
