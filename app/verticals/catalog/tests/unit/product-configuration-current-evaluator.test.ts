import { describe, expect, it } from 'effect-rstest';
import { Effect, Option } from 'effect';

import type {
  CurrentConfigurationRevision,
  ProductConfigurationPersistence,
} from '../../src/persistence/product-configuration-persistence.ts';
import { evaluateCurrentProductConfiguration } from '../../src/persistence/product-configuration-current-evaluator.ts';
import type {
  CurrentConfigurationValue,
  TrustedConfigurationTarget,
} from '../../src/persistence/product-configuration-current-evaluator.ts';

const at = new Date('2026-09-17T10:00:00.000Z');
const revision: CurrentConfigurationRevision = {
  choices: [
    {
      choiceKey: 'mount',
      kind: 'SINGLE_CHOICE',
      label: 'Mount',
      meaning: 'Mount',
      options: [
        { label: 'A', meaning: 'A', optionKey: 'A' },
        { label: 'B', meaning: 'B', optionKey: 'B' },
      ],
      required: true,
    },
    { choiceKey: 'length', kind: 'MEASURED_VALUE', label: 'Length', meaning: 'Length', required: true, unitId: 'cm' },
  ],
  compatibilityRules: [
    {
      choiceKey: 'mount',
      evidenceRefs: ['A max 100'],
      kind: 'CONDITIONAL_MAXIMUM',
      maximum: '100',
      maximumInclusive: true,
      optionKey: 'A',
      otherChoiceKey: 'length',
      ruleId: 'a-max',
    },
  ],
  definitionEvidenceRefs: ['owner:publication:2'],
  definitionId: 'definition',
  effectiveFrom: new Date('2026-09-17T09:00:00.000Z'),
  measuredRules: [
    {
      choiceKey: 'length',
      evidenceRefs: ['range'],
      maximum: '120',
      maximumInclusive: true,
      minimum: '60',
      minimumInclusive: true,
      step: '1',
      stepBase: '60',
    },
    {
      choiceKey: 'length',
      evidenceRefs: ['variant narrow'],
      maximum: '110',
      maximumInclusive: true,
      variantId: 'black',
    },
  ],
  optionAllowances: [
    { allowed: true, choiceKey: 'mount', evidenceRefs: ['A allowed'], optionKey: 'A' },
    { allowed: true, choiceKey: 'mount', evidenceRefs: ['B allowed'], optionKey: 'B' },
    { allowed: false, choiceKey: 'mount', evidenceRefs: ['black denies B'], optionKey: 'B', variantId: 'black' },
  ],
  productId: 'product',
  revision: 2,
  ruleCombination: 'CONJUNCTION_ONLY',
};
const mount: CurrentConfigurationValue = { choiceKey: 'mount', kind: 'SINGLE_CHOICE', optionKey: 'A' };
const length: CurrentConfigurationValue = { amount: '83', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' };
const values: readonly CurrentConfigurationValue[] = [mount, length];
const target: TrustedConfigurationTarget = { definitionId: 'definition', productId: 'product', variantId: 'black' };
const source = (value: CurrentConfigurationRevision | null): Pick<ProductConfigurationPersistence, 'readCurrent'> => ({
  readCurrent: () => Effect.succeed(value === null ? Option.none() : Option.some(value)),
});
const evaluate = (
  value: CurrentConfigurationRevision = revision,
  selected: readonly CurrentConfigurationValue[] = values,
  selectedTarget = target,
) => evaluateCurrentProductConfiguration(source(value), { at, target: selectedTarget, values: selected });

describe('Current Product Configuration evaluator', () => {
  it.effect('uses Current and retains exact applicable revision and rule evidence without rewriting values', () =>
    Effect.gen(function* validatesEvidence() {
      const before = JSON.stringify(values);
      expect(yield* evaluate()).toMatchObject({
        choiceRevisions: expect.arrayContaining([
          expect.objectContaining({
            choiceKey: 'mount',
            evidenceRefs: ['owner:publication:2'],
            kind: 'SINGLE_CHOICE',
            options: expect.arrayContaining([expect.objectContaining({ meaning: 'A', optionKey: 'A' })]),
            ownerModuleId: 'commerce.catalog',
            revision: 2,
          }),
          expect.objectContaining({ choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' }),
        ]),
        definitionRevision: 2,
        rules: expect.arrayContaining([
          expect.objectContaining({ evidenceRefs: ['owner:publication:2'], revision: 2, ruleId: 'choice:mount' }),
          expect.objectContaining({ evidenceRefs: ['owner:publication:2'], revision: 2, ruleId: 'option:mount:A' }),
          expect.objectContaining({ revision: 2, ruleId: 'a-max' }),
          expect.objectContaining({ evidenceRefs: ['variant narrow'], ruleId: 'measured:length:black:all-packages' }),
        ]),
        status: 'VALID',
      });
      expect(JSON.stringify(values)).toBe(before);
    }),
  );

  it.effect('applies Product and Variant allowances conjunctively', () =>
    Effect.gen(function* appliesAllowances() {
      expect(
        yield* evaluate(revision, [{ choiceKey: 'mount', kind: 'SINGLE_CHOICE', optionKey: 'B' }, length]),
      ).toMatchObject({
        code: 'OPTION_NOT_ALLOWED',
        ruleIds: ['allowance:mount:B:black:all-packages'],
        status: 'INVALID',
      });
      expect(
        (yield* evaluate(revision, [{ choiceKey: 'mount', kind: 'SINGLE_CHOICE', optionKey: 'B' }, length], {
          ...target,
          variantId: 'white',
        })).status,
      ).toBe('VALID');
    }),
  );

  it.effect('checks exact boundaries, steps, and compatibility without altering the measurement', () =>
    Effect.gen(function* checksConstraints() {
      expect(
        yield* evaluate(revision, [
          mount,
          { amount: '110', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' },
        ]),
      ).toMatchObject({
        code: 'INCOMPATIBLE_COMBINATION',
        ruleIds: ['a-max'],
        status: 'INVALID',
      });
      expect(
        (yield* evaluate(
          revision,
          [
            { choiceKey: 'mount', kind: 'SINGLE_CHOICE', optionKey: 'B' },
            { amount: '110', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' },
          ],
          { ...target, variantId: 'white' },
        )).status,
      ).toBe('VALID');
      expect(
        (yield* evaluate(
          revision,
          [
            { choiceKey: 'mount', kind: 'SINGLE_CHOICE', optionKey: 'B' },
            { amount: '120', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' },
          ],
          { ...target, variantId: 'white' },
        )).status,
      ).toBe('VALID');
      expect(
        yield* evaluate(revision, [
          mount,
          { amount: '83.5', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' },
        ]),
      ).toMatchObject({
        code: 'OFF_STEP',
        status: 'INVALID',
      });
    }),
  );

  it.effect('distinguishes missing choices, absent Current, and stale Current', () =>
    Effect.gen(function* distinguishesCurrent() {
      expect(yield* evaluate(revision, values.slice(1))).toMatchObject({
        code: 'REQUIRED_CHOICE_MISSING',
        status: 'INVALID',
      });
      expect(yield* evaluateCurrentProductConfiguration(source(null), { at, target, values })).toMatchObject({
        code: 'CURRENT_DEFINITION_UNAVAILABLE',
        status: 'INDETERMINATE',
      });
      expect(yield* evaluate({ ...revision, effectiveTo: at })).toMatchObject({
        code: 'CURRENT_DEFINITION_UNVERIFIED',
        status: 'INDETERMINATE',
      });
    }),
  );

  it.effect('never calls a choice Current without owner publication evidence', () =>
    Effect.gen(function* requiresChoiceRevision() {
      expect(yield* evaluate({ ...revision, definitionEvidenceRefs: [] })).toMatchObject({
        code: 'CHOICE_REVISION_UNVERIFIED',
        status: 'INDETERMINATE',
      });
    }),
  );

  it.effect('applies Package restrictions and lets a proven violation outrank an unknown rule', () =>
    Effect.gen(function* checksPackageAndUncertainty() {
      const packageRevision: CurrentConfigurationRevision = {
        ...revision,
        optionAllowances: [
          ...revision.optionAllowances,
          {
            allowed: false,
            choiceKey: 'mount',
            evidenceRefs: ['package restriction'],
            optionKey: 'A',
            packageDefinitionId: 'box',
            variantId: 'black',
          },
        ],
      };
      expect((yield* evaluate(packageRevision)).status).toBe('VALID');
      expect(yield* evaluate(packageRevision, values, { ...target, packageDefinitionId: 'box' })).toMatchObject({
        code: 'OPTION_NOT_ALLOWED',
        status: 'INVALID',
      });
      const uncertain: CurrentConfigurationRevision = {
        ...revision,
        optionAllowances: revision.optionAllowances.filter((rule) => rule.optionKey !== 'A'),
      };
      expect(
        yield* evaluate(uncertain, [
          mount,
          { amount: '83.5', choiceKey: 'length', kind: 'MEASURED_VALUE', unitId: 'cm' },
        ]),
      ).toMatchObject({
        code: 'OFF_STEP',
        status: 'INVALID',
      });
    }),
  );
});
