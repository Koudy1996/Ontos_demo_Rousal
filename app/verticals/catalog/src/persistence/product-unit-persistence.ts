import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Schema } from 'effect';

import type { CreateProductUnitPayload } from '../../shared/actions/create-product-unit.ts';
import type { RetireProductUnitPayload } from '../../shared/actions/retire-product-unit.ts';
import type { ReviseProductUnitPayload } from '../../shared/actions/revise-product-unit.ts';
import type { SetProductUnitTargetDivisibilityPayload } from '../../shared/actions/set-product-unit-target-divisibility.ts';
import { ProductUnitRuleInputSchema } from '../../shared/actions/product-unit-contract.ts';
import {
  ProductUnitRefSchema,
  ProductUnitRuleRevisionSchema,
  ProductUnitTargetDivisibilitySchema,
} from '../../shared/resources/product-unit.ts';
import {
  packageUnitDivisibility,
  packageUnitDivisibilityRevisions,
  productUnitRuleRevisions,
  productUnits,
  variantUnitDivisibility,
  variantUnitDivisibilityRevisions,
} from '../database/schema.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];
type UnitRow = typeof productUnits.$inferSelect;
type Evidence = { readonly actionInvocationId: string; readonly principalId: string };
type Input<Payload> = Evidence & { readonly payload: Payload };
type Target = SetProductUnitTargetDivisibilityPayload['target'];
type ExpectedSources = SetProductUnitTargetDivisibilityPayload['expectedSources'];
const unitType = 'commerce.catalog.product-unit';

export class ProductUnitPersistenceUnavailable extends Schema.TaggedError<ProductUnitPersistenceUnavailable>()(
  'ProductUnitPersistenceUnavailable',
  { code: Schema.Literal('product_unit_persistence_unavailable'), reason: Schema.String },
) {}

export type ProductUnitMutationOutcome =
  | {
      readonly _tag: 'created' | 'revised' | 'retired' | 'divisibility_set';
      readonly unit: typeof ProductUnitRefSchema.Type;
      readonly ruleRevision: typeof ProductUnitRuleRevisionSchema.Type;
      readonly targetDivisibility?: typeof ProductUnitTargetDivisibilitySchema.Type;
    }
  | { readonly _tag: 'invalid'; readonly reason: string }
  | { readonly _tag: 'not_found' }
  | { readonly _tag: 'stale'; readonly actualRevision: number };

export interface ProductUnitPersistence {
  readonly create: (
    input: Input<CreateProductUnitPayload>,
  ) => Effect.Effect<ProductUnitMutationOutcome, ProductUnitPersistenceUnavailable>;
  readonly revise: (
    input: Input<ReviseProductUnitPayload>,
  ) => Effect.Effect<ProductUnitMutationOutcome, ProductUnitPersistenceUnavailable>;
  readonly retire: (
    input: Input<RetireProductUnitPayload>,
  ) => Effect.Effect<ProductUnitMutationOutcome, ProductUnitPersistenceUnavailable>;
  readonly setTargetDivisibility: (
    input: Input<SetProductUnitTargetDivisibilityPayload>,
  ) => Effect.Effect<ProductUnitMutationOutcome, ProductUnitPersistenceUnavailable>;
}

/** Supplied by an owner-local Current-basis service; request metadata never proves Current. */
export interface ProductUnitTargetBasis {
  readonly verify: (
    target: Target,
    expectedSources: ExpectedSources,
  ) => Effect.Effect<'valid' | 'invalid' | 'stale', ProductUnitPersistenceUnavailable>;
}

const unavailable = (cause?: unknown) => {
  const failure = new ProductUnitPersistenceUnavailable({
    code: 'product_unit_persistence_unavailable',
    reason: 'Authoritative Product Unit basis or persistence is unavailable',
  });
  if (cause !== undefined) Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

const validRef = (ref: typeof ProductUnitRefSchema.Type, tenantId: string) =>
  Schema.is(ProductUnitRefSchema)(ref) &&
  ref.moduleId === 'commerce.catalog' &&
  ref.resourceType === unitType &&
  ref.tenantId === tenantId;

const validEvidence = (
  input: Evidence & { readonly payload: { readonly reason: string; readonly evidenceRefs: readonly string[] } },
) =>
  input.payload.reason.length > 0 &&
  input.payload.reason.length <= 1000 &&
  input.payload.reason === input.payload.reason.trim() &&
  input.payload.evidenceRefs.length > 0 &&
  input.payload.evidenceRefs.every((ref) => ref.length > 0 && ref.length <= 300 && ref === ref.trim());

const makeResult = Effect.fn('ProductUnitPersistence.makeResult')(function* makeResult(
  tag: 'created' | 'revised' | 'retired' | 'divisibility_set',
  row: UnitRow,
  rule: { readonly revision: number; readonly step: string; readonly rounding: 'UP' | 'DOWN' | 'HALF_UP' },
  targetDivisibility?: typeof ProductUnitTargetDivisibilitySchema.Type,
) {
  const unit = yield* Schema.decodeEffect(ProductUnitRefSchema)({
    moduleId: 'commerce.catalog',
    resourceId: row.unitId,
    resourceType: unitType,
    tenantId: row.tenantId,
  });
  const ruleRevision = yield* Schema.decodeEffect(ProductUnitRuleRevisionSchema)({
    revision: rule.revision,
    rounding: rule.rounding,
    step: rule.step,
    unit,
  });
  return targetDivisibility === undefined
    ? { _tag: tag, ruleRevision, unit }
    : { _tag: tag, ruleRevision, targetDivisibility, unit };
}, Effect.mapError(unavailable));

/** Core owns transaction, scope verification and RLS setting; every query also predicates tenant. */
export const productUnitPersistenceForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  basis?: ProductUnitTargetBasis,
): ProductUnitPersistence => {
  const { tenantId } = scope;
  const getUnit = (unitId: string) =>
    transaction
      .select()
      .from(productUnits)
      .where(and(eq(productUnits.tenantId, tenantId), eq(productUnits.unitId, unitId)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
  const getRule = (unitId: string, revision: number) =>
    transaction
      .select()
      .from(productUnitRuleRevisions)
      .where(
        and(
          eq(productUnitRuleRevisions.tenantId, tenantId),
          eq(productUnitRuleRevisions.unitId, unitId),
          eq(productUnitRuleRevisions.revision, revision),
        ),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
  const appendRule = (
    row: UnitRow,
    input: Evidence & { readonly payload: { readonly reason: string; readonly evidenceRefs: readonly string[] } },
    rule: { readonly step: string; readonly rounding: 'UP' | 'DOWN' | 'HALF_UP' },
    changeKind: string,
  ) =>
    transaction
      .insert(productUnitRuleRevisions)
      .values({
        tenantId,
        unitId: row.unitId,
        revision: row.currentRuleRevision,
        step: rule.step,
        rounding: rule.rounding,
        lifecycleState: row.lifecycleState,
        changeKind,
        reason: input.payload.reason,
        evidenceRefs: [...input.payload.evidenceRefs],
        actionInvocationId: input.actionInvocationId,
        actingPrincipalId: input.principalId,
      })
      .pipe(Effect.mapError(unavailable));

  const create: ProductUnitPersistence['create'] = Effect.fn('ProductUnitPersistence.create')(function* create(input) {
    const { unitRef, code, label, rule } = input.payload;
    if (
      !validRef(unitRef, tenantId) ||
      !validEvidence(input) ||
      !Schema.is(ProductUnitRuleInputSchema)(rule) ||
      code.length === 0 ||
      code.length > 80 ||
      code !== code.trim() ||
      label.length === 0 ||
      label.length > 240 ||
      label !== label.trim()
    ) {
      return { _tag: 'invalid', reason: 'Product Unit meaning, rule or evidence is invalid' };
    }
    const [existing] = yield* getUnit(unitRef.resourceId);
    if (existing !== undefined) return { _tag: 'invalid', reason: 'Product Unit identity already exists' };
    const [row] = yield* transaction
      .insert(productUnits)
      .values({ tenantId, unitId: unitRef.resourceId, code, label, lifecycleState: 'ACTIVE', currentRuleRevision: 1 })
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (row === undefined) return yield* unavailable();
    yield* appendRule(row, input, rule, 'CREATED');
    return yield* makeResult('created', row, { revision: 1, ...rule });
  });

  const revise: ProductUnitPersistence['revise'] = Effect.fn('ProductUnitPersistence.revise')(function* revise(input) {
    const { expectedCurrent, rule } = input.payload;
    if (
      !validRef(expectedCurrent.unit, tenantId) ||
      !validEvidence(input) ||
      !Schema.is(ProductUnitRuleInputSchema)(rule)
    )
      return { _tag: 'invalid', reason: 'Product Unit rule or evidence is invalid' };
    const [row] = yield* getUnit(expectedCurrent.unit.resourceId);
    if (row === undefined) return { _tag: 'not_found' };
    if (row.currentRuleRevision !== expectedCurrent.revision)
      return { _tag: 'stale', actualRevision: row.currentRuleRevision };
    if (row.lifecycleState !== 'ACTIVE') return { _tag: 'invalid', reason: 'Retired Product Unit cannot be revised' };
    const [prior] = yield* getRule(row.unitId, row.currentRuleRevision);
    if (prior === undefined) return yield* unavailable();
    const [updated] = yield* transaction
      .update(productUnits)
      .set({ currentRuleRevision: row.currentRuleRevision + 1 })
      .where(
        and(
          eq(productUnits.tenantId, tenantId),
          eq(productUnits.unitId, row.unitId),
          eq(productUnits.currentRuleRevision, row.currentRuleRevision),
          eq(productUnits.lifecycleState, 'ACTIVE'),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) return { _tag: 'stale', actualRevision: row.currentRuleRevision };
    yield* appendRule(updated, input, rule, 'REVISED');
    return yield* makeResult('revised', updated, { revision: updated.currentRuleRevision, ...rule });
  });

  const retire: ProductUnitPersistence['retire'] = Effect.fn('ProductUnitPersistence.retire')(function* retire(input) {
    const { expectedCurrent } = input.payload;
    if (!validRef(expectedCurrent.unit, tenantId) || !validEvidence(input))
      return { _tag: 'invalid', reason: 'Product Unit reference or evidence is invalid' };
    const [row] = yield* getUnit(expectedCurrent.unit.resourceId);
    if (row === undefined) return { _tag: 'not_found' };
    if (row.currentRuleRevision !== expectedCurrent.revision)
      return { _tag: 'stale', actualRevision: row.currentRuleRevision };
    if (row.lifecycleState !== 'ACTIVE') return { _tag: 'invalid', reason: 'Product Unit is already retired' };
    const [prior] = yield* getRule(row.unitId, row.currentRuleRevision);
    if (prior === undefined) return yield* unavailable();
    const [updated] = yield* transaction
      .update(productUnits)
      .set({ currentRuleRevision: row.currentRuleRevision + 1, lifecycleState: 'RETIRED' })
      .where(
        and(
          eq(productUnits.tenantId, tenantId),
          eq(productUnits.unitId, row.unitId),
          eq(productUnits.currentRuleRevision, row.currentRuleRevision),
          eq(productUnits.lifecycleState, 'ACTIVE'),
        ),
      )
      .returning()
      .pipe(Effect.mapError(unavailable));
    if (updated === undefined) return { _tag: 'stale', actualRevision: row.currentRuleRevision };
    if (prior.rounding !== 'UP' && prior.rounding !== 'DOWN' && prior.rounding !== 'HALF_UP')
      return yield* unavailable();
    yield* appendRule(updated, input, { step: prior.step, rounding: prior.rounding }, 'RETIRED');
    return yield* makeResult('retired', updated, {
      revision: updated.currentRuleRevision,
      step: prior.step,
      rounding: prior.rounding,
    });
  });

  const setTargetDivisibility: ProductUnitPersistence['setTargetDivisibility'] = Effect.fn(
    'ProductUnitPersistence.setTargetDivisibility',
  )(function* setTargetDivisibility(input) {
    const { target, divisible, expectedCurrentRevision, expectedSources } = input.payload;
    if (!validRef(target.unit, tenantId) || target.tenantId !== tenantId || !validEvidence(input))
      return { _tag: 'invalid', reason: 'Product Unit target or evidence is invalid' };
    const [unit] = yield* getUnit(target.unit.resourceId);
    if (unit === undefined) return { _tag: 'not_found' };
    if (unit.lifecycleState !== 'ACTIVE') return { _tag: 'invalid', reason: 'Retired Product Unit cannot be assigned' };
    const [rule] = yield* getRule(unit.unitId, unit.currentRuleRevision);
    if (rule === undefined || (rule.rounding !== 'UP' && rule.rounding !== 'DOWN' && rule.rounding !== 'HALF_UP'))
      return yield* unavailable();
    const currentRounding = rule.rounding;
    if (basis === undefined) return yield* unavailable();
    const basisResult = yield* basis.verify(target, expectedSources);
    if (basisResult === 'invalid')
      return { _tag: 'invalid', reason: 'Product Unit target is not an active Tenant-owned purchase target' };
    if (basisResult === 'stale') return { _tag: 'stale', actualRevision: 0 };
    const variant = target.targetType === 'commerce.catalog.variant';
    const currentTable = variant ? variantUnitDivisibility : packageUnitDivisibility;
    const targetColumn = variant ? variantUnitDivisibility.variantId : packageUnitDivisibility.packageDefinitionId;
    const [current] = yield* transaction
      .select()
      .from(currentTable)
      .where(and(eq(currentTable.tenantId, tenantId), eq(targetColumn, target.targetId)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (current === undefined && expectedCurrentRevision !== undefined) return { _tag: 'stale', actualRevision: 0 };
    if (current !== undefined && expectedCurrentRevision !== current.currentRevision)
      return { _tag: 'stale', actualRevision: current.currentRevision };
    if (current !== undefined && current.unitId !== unit.unitId)
      return { _tag: 'invalid', reason: 'Target Unit identity cannot be silently reassigned' };
    const revision = (current?.currentRevision ?? 0) + 1;
    if (variant) {
      if (current === undefined)
        yield* transaction
          .insert(variantUnitDivisibility)
          .values({ tenantId, variantId: target.targetId, unitId: unit.unitId, currentRevision: revision, divisible })
          .pipe(Effect.mapError(unavailable));
      else {
        const [updated] = yield* transaction
          .update(variantUnitDivisibility)
          .set({ currentRevision: revision, divisible })
          .where(
            and(
              eq(variantUnitDivisibility.tenantId, tenantId),
              eq(variantUnitDivisibility.variantId, target.targetId),
              eq(variantUnitDivisibility.currentRevision, current.currentRevision),
            ),
          )
          .returning()
          .pipe(Effect.mapError(unavailable));
        if (updated === undefined) return { _tag: 'stale', actualRevision: current.currentRevision };
      }
      yield* transaction
        .insert(variantUnitDivisibilityRevisions)
        .values({
          tenantId,
          variantId: target.targetId,
          revision,
          unitId: unit.unitId,
          divisible,
          reason: input.payload.reason,
          evidenceRefs: [...input.payload.evidenceRefs],
          actionInvocationId: input.actionInvocationId,
          actingPrincipalId: input.principalId,
        })
        .pipe(Effect.mapError(unavailable));
    } else {
      if (current === undefined)
        yield* transaction
          .insert(packageUnitDivisibility)
          .values({
            tenantId,
            packageDefinitionId: target.targetId,
            unitId: unit.unitId,
            currentRevision: revision,
            divisible,
          })
          .pipe(Effect.mapError(unavailable));
      else {
        const [updated] = yield* transaction
          .update(packageUnitDivisibility)
          .set({ currentRevision: revision, divisible })
          .where(
            and(
              eq(packageUnitDivisibility.tenantId, tenantId),
              eq(packageUnitDivisibility.packageDefinitionId, target.targetId),
              eq(packageUnitDivisibility.currentRevision, current.currentRevision),
            ),
          )
          .returning()
          .pipe(Effect.mapError(unavailable));
        if (updated === undefined) return { _tag: 'stale', actualRevision: current.currentRevision };
      }
      yield* transaction
        .insert(packageUnitDivisibilityRevisions)
        .values({
          tenantId,
          packageDefinitionId: target.targetId,
          revision,
          unitId: unit.unitId,
          divisible,
          reason: input.payload.reason,
          evidenceRefs: [...input.payload.evidenceRefs],
          actionInvocationId: input.actionInvocationId,
          actingPrincipalId: input.principalId,
        })
        .pipe(Effect.mapError(unavailable));
    }
    const targetDivisibility = yield* Schema.decodeEffect(ProductUnitTargetDivisibilitySchema)({
      tenantId,
      targetId: target.targetId,
      targetType: target.targetType,
      unit: target.unit,
      revision,
      divisible,
    }).pipe(Effect.mapError(unavailable));
    return yield* makeResult(
      'divisibility_set',
      unit,
      { revision: rule.revision, step: rule.step, rounding: currentRounding },
      targetDivisibility,
    );
  });
  return { create, revise, retire, setTargetDivisibility };
};
