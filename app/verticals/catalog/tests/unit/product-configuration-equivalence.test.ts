import { Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  CatalogResourceRefSchema,
  CatalogRevisionNumberSchema,
} from '../../shared/domain/catalog-revision-reference.ts';
import type {
  ProductConfiguration,
  ProductConfigurationDefinitionRevision,
  ProductConfigurationRevisionEquivalenceAttestation,
} from '../../shared/domain/product-configuration.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';
import { VariantRefSchema } from '../../shared/resources/variant.ts';
import { assessProductConfigurationEquivalence } from '../../src/domain/product-configuration-equivalence.ts';
import type {
  CurrentConfigurationAssessment,
  CurrentConfigurationAssessmentInput,
} from '../../src/persistence/product-configuration-current-evaluator.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const ref = (resourceType: string, resourceId: string) =>
  Schema.decodeUnknownSync(CatalogResourceRefSchema)({
    moduleId: 'commerce.catalog',
    resourceId,
    resourceType,
    tenantId,
  });
const productRef = Schema.decodeUnknownSync(ProductRefSchema)(
  ref('commerce.catalog.product', '22222222-2222-4222-8222-222222222222'),
);
const variantRef = Schema.decodeUnknownSync(VariantRefSchema)(
  ref('commerce.catalog.variant', '33333333-3333-4333-8333-333333333333'),
);
const unitRef = ref('commerce.catalog.unit', '44444444-4444-4444-8444-444444444444');
const definitionRef = ref('commerce.catalog.configuration-definition', '55555555-5555-4555-8555-555555555555');
const definition = (revision: number): ProductConfigurationDefinitionRevision => ({
  choices: [{ choiceKey: 'length', kind: 'MEASURED_VALUE', meaning: 'Exact length', required: true, unitRef }],
  productRef,
  reference: { resourceRef: definitionRef, revision: Schema.decodeUnknownSync(CatalogRevisionNumberSchema)(revision) },
});
const leftDefinition = definition(1);
const rightDefinition = definition(2);
const selection = (source: ProductConfigurationDefinitionRevision): ProductConfiguration => ({
  definition: source.reference,
  productRef,
  values: [{ amount: '83', choiceKey: 'length', kind: 'MEASURED_VALUE', unitRef }],
  variantRef,
});
const left = selection(leftDefinition);
const right = selection(rightDefinition);
const at = new Date('2026-09-18T12:00:00.000Z');
const input: CurrentConfigurationAssessmentInput = {
  at,
  target: {
    definitionId: definitionRef.resourceId,
    productId: productRef.resourceId,
    variantId: variantRef.resourceId,
  },
  values: [{ amount: '83', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: unitRef.resourceId }],
};
const assessment = (revision: number): CurrentConfigurationAssessment => ({
  assessedAt: at,
  choiceRevisions: [],
  definitionId: definitionRef.resourceId,
  definitionRevision: revision,
  rules: [{ evidenceRefs: ['owner-evidence'], revision, ruleId: 'length-rule' }],
  status: 'VALID',
  target: input.target,
  unitRevisions: [],
});
const rule = (source: ProductConfigurationDefinitionRevision) => ({
  definitionRevision: source.reference,
  kind: 'MEASURED' as const,
  ownerModuleId: 'commerce.catalog' as const,
  revision: source.reference.revision,
  ruleId: 'length-rule',
});
const attestation: ProductConfigurationRevisionEquivalenceAttestation = {
  admissibility: {
    completeCurrentRuleBasis: true,
    left: 'ADMISSIBLE',
    leftRuleRevisions: [rule(leftDefinition)],
    right: 'ADMISSIBLE',
    rightRuleRevisions: [rule(rightDefinition)],
  },
  attestationId: 'owner-assessment',
  leftSelection: left,
  meaning: { choicesAndValues: 'SAME', units: 'SAME' },
  ownerModuleId: 'commerce.catalog',
  rightSelection: right,
  source: 'CATALOG_OWNER_EQUIVALENCE_ASSESSMENT',
  status: 'CONFIRMED',
};

const compare = (
  rightInput: CurrentConfigurationAssessmentInput = input,
  rightAssessment: CurrentConfigurationAssessment | undefined = assessment(2),
  proof: ProductConfigurationRevisionEquivalenceAttestation | undefined = attestation,
) =>
  assessProductConfigurationEquivalence(
    left,
    leftDefinition,
    input,
    assessment(1),
    right,
    rightDefinition,
    rightInput,
    rightAssessment,
    proof,
  );

describe('owner-private Product Configuration equivalence gate', () => {
  it('requires exact owner assessments and matching rule bases', () => {
    const missingProof = new Map<string, ProductConfigurationRevisionEquivalenceAttestation>().get('missing');
    const missingAssessment = new Map<string, CurrentConfigurationAssessment>().get('missing');
    expect(compare()).toMatchObject({ same: true, status: 'VALID' });
    expect(
      assessProductConfigurationEquivalence(
        left,
        leftDefinition,
        input,
        assessment(1),
        right,
        rightDefinition,
        input,
        missingAssessment,
        attestation,
      ).status,
    ).toBe('INDETERMINATE');
    expect(
      assessProductConfigurationEquivalence(
        left,
        leftDefinition,
        input,
        assessment(1),
        right,
        rightDefinition,
        input,
        assessment(2),
        missingProof,
      ).status,
    ).toBe('INDETERMINATE');
    expect(compare(input, { ...assessment(2), rules: [] }).status).toBe('INDETERMINATE');
    expect(
      compare(input, {
        ...assessment(2),
        rules: [{ evidenceRefs: ['owner-evidence'], revision: 2, ruleId: 'other-rule' }],
      }).status,
    ).toBe('INDETERMINATE');
  });

  it('does not reuse a valid assessment for a different value or target', () => {
    expect(
      compare({
        ...input,
        values: [{ amount: '84', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: unitRef.resourceId }],
      }).status,
    ).toBe('INDETERMINATE');
    expect(compare({ ...input, target: { ...input.target, variantId: 'other' } }).status).toBe('INDETERMINATE');
    expect(compare({ ...input, values: [...input.values, input.values[0]] }).status).toBe('INDETERMINATE');
  });
});
