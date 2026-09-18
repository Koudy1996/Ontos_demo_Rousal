import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'effect-rstest';

import {
  VariantUseChangeBasisUnavailable,
  variantUseChangePersistenceForAxes,
} from '../../src/persistence/variant-use-change-persistence.ts';
import type {
  VariantReactivationBasis,
  VariantReactivationBasisPersistence,
} from '../../src/persistence/variant-use-change-persistence.ts';
import type {
  CurrentVariantAxes,
  CurrentVariantAxisValue,
  VariantAxisPersistence,
} from '../../src/persistence/variant-axis-persistence.ts';
import {
  recordedVariantCombinationKey,
  VariantAxisBasisUnavailable,
} from '../../src/persistence/variant-axis-persistence.ts';
import { VariantUseChangeConflict } from '../../shared/domain/variant-use-change.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const otherVariantId = '44444444-4444-4444-8444-444444444444';
const definitionId = '55555555-5555-4555-8555-555555555555';
const valueSetId = '66666666-6666-4666-8666-666666666666';
const axes: CurrentVariantAxes = {
  axes: [],
  axisRevision: 1,
  productId: productRef.resourceId,
  productTypeRevision: 2,
};
const item = {
  attributeDefinitionId: definitionId,
  attributeValueSetId: valueSetId,
  controlledAttributeValueId: '77777777-7777-4777-8777-777777777777',
  numericValue: null,
  ordinal: 0,
  specialState: null,
  tenantId,
  textValue: null,
  unit: null,
  valueKind: 'CONTROLLED',
};
const value: CurrentVariantAxisValue = {
  attributeDefinitionId: definitionId,
  definitionRevision: 3,
  items: [item],
  source: 'VARIANT',
  sourceRevision: 5,
  sourceValueSetRef: { attributeValueSetId: valueSetId, tenantId },
};
const reactivationKey = recordedVariantCombinationKey([value], tenantId);
const unexpected = () => Effect.die('Unexpected axis read');
const basis = (overrides: Partial<VariantReactivationBasis> = {}): VariantReactivationBasisPersistence => ({
  read: () => Effect.succeed({ parentProductLifecycle: 'ACTIVE', requiredPackageOptions: [], ...overrides }),
});
const persistence = (
  overrides: Partial<VariantAxisPersistence>,
  basisOverrides: Partial<VariantReactivationBasis> = {},
) => {
  const service: VariantAxisPersistence = {
    govern: unexpected,
    readCurrent: () => Effect.succeed(axes),
    readEffectiveValues: () => Effect.succeed([value]),
    readRecordedCombinations: () =>
      Effect.succeed([{ axisRevision: 1, combinationKey: 'a'.repeat(64), variantId: otherVariantId }]),
    readRecordedVariants: unexpected,
    ...overrides,
  };
  return variantUseChangePersistenceForAxes(service, basis(basisOverrides), tenantId);
};

describe('Variant use change persistence (#441)', () => {
  it.effect('reports a definite conflict when reactivation reproduces an ACTIVE combination', () =>
    Effect.gen(function* collision() {
      const failure = yield* persistence({
        readRecordedCombinations: () =>
          Effect.succeed([{ axisRevision: 1, combinationKey: reactivationKey, variantId: otherVariantId }]),
      })
        .assessReactivation({ productRef, variantRef })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeConflict)(failure)).toBe(true);
      expect(failure).toMatchObject({ conflict: 'DUPLICATE_COMBINATION' });
    }),
  );

  it.effect('requires #479 revalidation when the reconstructed identity is collision-free', () =>
    Effect.gen(function* clean() {
      const decision = yield* persistence({}).assessReactivation({ productRef, variantRef });
      expect(decision).toEqual({ changeKind: 'CORRECTED', revalidation: 'REQUIRED' });
    }),
  );

  it.effect('blocks a retired parent Product before looking for a Current collision', () =>
    Effect.gen(function* retiredParent() {
      const failure = yield* persistence({}, { parentProductLifecycle: 'RETIRED' })
        .assessReactivation({ productRef, variantRef })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeConflict)(failure)).toBe(true);
      expect(failure).toMatchObject({ conflict: 'RETIRED_PARENT_PRODUCT' });
    }),
  );

  it.effect('blocks reactivation while a required Package Option is retired or inactive', () =>
    Effect.gen(function* retiredPackageOption() {
      const failure = yield* persistence({}, { requiredPackageOptions: [{ lifecycle: 'RETIRED' }] })
        .assessReactivation({ productRef, variantRef })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeConflict)(failure)).toBe(true);
      expect(failure).toMatchObject({ conflict: 'RETIRED_PACKAGE_OPTION' });
    }),
  );

  it.effect('fails closed when the owner-issued reactivation lifecycle basis is unavailable', () =>
    Effect.gen(function* unavailableReactivationBasis() {
      const failure = yield* variantUseChangePersistenceForAxes(
        {
          govern: unexpected,
          readCurrent: () => Effect.succeed(axes),
          readEffectiveValues: () => Effect.succeed([value]),
          readRecordedCombinations: () =>
            Effect.succeed([{ axisRevision: 1, combinationKey: 'a'.repeat(64), variantId: otherVariantId }]),
          readRecordedVariants: unexpected,
        },
        {
          read: () =>
            Effect.fail(
              new VariantUseChangeBasisUnavailable({ code: 'variant_use_change_basis_unavailable', reason: 'missing' }),
            ),
        },
        tenantId,
      )
        .assessReactivation({ productRef, variantRef })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('fails closed when the retired Variant no longer carries a documented value', () =>
    Effect.gen(function* missingValue() {
      const failure = yield* persistence({
        readEffectiveValues: () =>
          Effect.succeed([{ ...value, items: [], source: 'MISSING' as const, sourceRevision: null }]),
      })
        .assessReactivation({ productRef, variantRef })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('maps an unavailable Current axis basis to a typed basis failure', () =>
    Effect.gen(function* unavailableBasis() {
      const failure = yield* persistence({
        readCurrent: () =>
          Effect.fail(
            new VariantAxisBasisUnavailable({
              code: 'variant_axis_basis_unavailable',
              reason: 'stale',
            }),
          ),
      })
        .assessReactivation({ productRef, variantRef })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeBasisUnavailable)(failure)).toBe(true);
    }),
  );

  it.effect('rejects a foreign tenant before reading private data', () =>
    Effect.gen(function* foreignTenant() {
      const failure = yield* persistence({
        readCurrent: () => Effect.die('foreign tenant must not read'),
      })
        .assessReactivation({
          productRef: { ...productRef, tenantId: '99999999-9999-4999-8999-999999999999' },
          variantRef,
        })
        .pipe(Effect.flip);
      expect(Schema.is(VariantUseChangeBasisUnavailable)(failure)).toBe(true);
    }),
  );
});
