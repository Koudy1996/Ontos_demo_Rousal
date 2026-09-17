import { TrustedPrincipalContextSchema } from '@app/core-runtime';
import { Effect, Exit, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  productConfigurationChoiceOptions,
  productConfigurationChoices,
  productConfigurationCompatibilityRules,
  productConfigurationDefinitionRevisions,
  productConfigurationDefinitions,
  productConfigurationMeasuredRules,
  productConfigurationOptionAllowances,
  productConfigurationRevisionActivations,
  products,
} from '../../src/database/schema.ts';
import {
  inspectProductConfigurationPublishInput,
  productConfigurationPersistenceForScope,
} from '../../src/persistence/product-configuration-persistence.ts';
import type { PublishProductConfigurationInput } from '../../src/persistence/product-configuration-persistence.ts';

const input: PublishProductConfigurationInput = {
  actionInvocationId: '11111111-1111-4111-8111-111111111111',
  choices: [
    {
      choiceKey: 'mount',
      kind: 'SINGLE_CHOICE',
      label: 'Mount',
      meaning: 'Mounting type',
      options: [
        { label: 'A', meaning: 'A mounting part', optionKey: 'A' },
        { label: 'B', meaning: 'B mounting part', optionKey: 'B' },
      ],
      required: true,
    },
    {
      choiceKey: 'length',
      kind: 'MEASURED_VALUE',
      label: 'Length',
      meaning: 'Cut length',
      required: true,
      unitId: '55555555-5555-4555-8555-555555555555',
    },
  ],
  compatibilityRules: [
    {
      choiceKey: 'mount',
      evidenceRefs: ['product-engineering:42'],
      kind: 'CONDITIONAL_MAXIMUM',
      maximum: '100',
      maximumInclusive: true,
      optionKey: 'A',
      otherChoiceKey: 'length',
      ruleId: '66666666-6666-4666-8666-666666666666',
    },
  ],
  definitionId: '44444444-4444-4444-8444-444444444444',
  effectiveFrom: new Date('2026-09-18T00:00:00Z'),
  evidenceRefs: ['product-engineering:42'],
  expectedRevision: 0,
  measuredRules: [
    {
      choiceKey: 'length',
      evidenceRefs: ['product-engineering:42'],
      maximum: '120',
      maximumInclusive: true,
      minimum: '0',
      minimumInclusive: false,
      step: '0.5',
      stepBase: '0',
    },
  ],
  optionAllowances: [
    { allowed: true, choiceKey: 'mount', evidenceRefs: ['product-engineering:42'], optionKey: 'A' },
    { allowed: false, choiceKey: 'mount', evidenceRefs: ['product-engineering:42'], optionKey: 'B' },
  ],
  principalId: '22222222-2222-4222-8222-222222222222',
  productId: '33333333-3333-4333-8333-333333333333',
  reason: 'Verified product configuration',
};

describe('Product Configuration publication input', () => {
  it('accepts an explicit, bounded Product-level rule snapshot', () => {
    expect(inspectProductConfigurationPublishInput(input)).toBeNull();
  });

  it('does not interpret an absent option decision as unrestricted', () => {
    expect(
      inspectProductConfigurationPublishInput({ ...input, optionAllowances: input.optionAllowances.slice(0, 1) }),
    ).toContain('explicit Product-level allowance');
  });

  it('distinguishes a confirmed unbounded measured rule from a missing rule', () => {
    expect(
      inspectProductConfigurationPublishInput({
        ...input,
        measuredRules: [{ choiceKey: 'length', evidenceRefs: ['product-engineering:42'] }],
      }),
    ).toBeNull();
    expect(inspectProductConfigurationPublishInput({ ...input, measuredRules: [] })).toContain(
      'explicit Product-level rule',
    );
  });

  it('rejects a step without its reference base and duplicate identities', () => {
    expect(
      inspectProductConfigurationPublishInput({
        ...input,
        measuredRules: [{ choiceKey: 'length', evidenceRefs: ['product-engineering:42'], step: '0.5' }],
      }),
    ).toContain('bounds or step');
    expect(
      inspectProductConfigurationPublishInput({ ...input, choices: [...input.choices, input.choices[0]] }),
    ).toContain('unique');
  });

  it('compares decimal bounds exactly beyond JavaScript safe integers', () => {
    expect(
      inspectProductConfigurationPublishInput({
        ...input,
        measuredRules: [
          {
            choiceKey: 'length',
            evidenceRefs: ['product-engineering:42'],
            maximum: '9007199254740992',
            maximumInclusive: true,
            minimum: '9007199254740993',
            minimumInclusive: true,
          },
        ],
      }),
    ).toContain('bounds or step');
    expect(
      inspectProductConfigurationPublishInput({
        ...input,
        measuredRules: [
          {
            choiceKey: 'length',
            evidenceRefs: ['product-engineering:42'],
            step: '0.00000000000000000000000001',
            stepBase: '0',
          },
        ],
      }),
    ).toBeNull();
  });

  it('rejects unsupported compatibility operands and missing evidence', () => {
    expect(
      inspectProductConfigurationPublishInput({
        ...input,
        compatibilityRules: [{ ...input.compatibilityRules[0], otherChoiceKey: 'unknown' }],
      }),
    ).toContain('operands');
    expect(inspectProductConfigurationPublishInput({ ...input, evidenceRefs: [] })).toContain('evidence');
  });
});

const scope = {
  ...Schema.decodeUnknownSync(TrustedPrincipalContextSchema)({
    authContextRef: 'job:configuration-test:run:1',
    authMethod: 'system',
    principalId: input.principalId,
    tenantId: '99999999-9999-4999-8999-999999999999',
  }),
  correlationId: 'configuration-test',
};

type Table =
  | typeof productConfigurationChoiceOptions
  | typeof productConfigurationChoices
  | typeof productConfigurationCompatibilityRules
  | typeof productConfigurationDefinitionRevisions
  | typeof productConfigurationDefinitions
  | typeof productConfigurationMeasuredRules
  | typeof productConfigurationOptionAllowances
  | typeof productConfigurationRevisionActivations
  | typeof products;
type WriteValue =
  | typeof productConfigurationDefinitions.$inferInsert
  | typeof productConfigurationDefinitionRevisions.$inferInsert
  | typeof productConfigurationRevisionActivations.$inferInsert
  | typeof productConfigurationChoices.$inferInsert
  | typeof productConfigurationChoiceOptions.$inferInsert
  | typeof productConfigurationOptionAllowances.$inferInsert
  | typeof productConfigurationMeasuredRules.$inferInsert
  | typeof productConfigurationCompatibilityRules.$inferInsert;
const empty = Effect.succeed([]);
const locked = (table: Table) => ({
  limit: () => Effect.succeed(table === products ? [{ lifecycleState: 'ACTIVE' }] : []),
});
const filtered = (table: Table) => ({ for: () => locked(table), limit: () => empty });
const fixture = (writes: object[]) => ({
  insert: (table: Table) => ({
    values: (value: WriteValue | readonly WriteValue[]) => {
      writes.push([table, value]);
      return empty;
    },
  }),
  select: () => ({ from: (table: Table) => ({ where: () => filtered(table) }) }),
});

describe('Product Configuration private publication', () => {
  it.effect('publishes the first exact snapshot only with an owner impact proof', () =>
    Effect.gen(function* publishFirst() {
      const writes: object[] = [];
      // @ts-expect-error Mock covers this scoped Drizzle chain.
      const withoutProof = productConfigurationPersistenceForScope(fixture(writes), scope);
      const failed = yield* Effect.exit(withoutProof.publish(input));
      expect(Exit.isFailure(failed)).toBe(true);
      expect(writes).toEqual([]);

      // @ts-expect-error Mock covers this scoped Drizzle chain.
      const withProof = productConfigurationPersistenceForScope(fixture(writes), scope, {
        verify: () => Effect.succeed(true),
      });
      const forged = yield* withProof.publish({ ...input, principalId: scope.tenantId });
      expect('reason' in forged ? forged.reason : null).toContain('trusted operation scope');
      expect(writes).toEqual([]);
      const outcome = yield* withProof.publish(input);
      expect('revision' in outcome ? outcome.revision : null).toBe(1);
      expect(writes.map((write) => (Array.isArray(write) ? write[0] : null))).toEqual([
        productConfigurationDefinitions,
        productConfigurationDefinitionRevisions,
        productConfigurationRevisionActivations,
        productConfigurationChoices,
        productConfigurationChoiceOptions,
        productConfigurationChoices,
        productConfigurationOptionAllowances,
        productConfigurationOptionAllowances,
        productConfigurationMeasuredRules,
        productConfigurationCompatibilityRules,
      ]);
    }),
  );
});
