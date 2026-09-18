import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { findPostgresFailure } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type { AttributeDefinition } from '../../shared/domain/attribute-values.ts';
import { AttributeDefinitionSchema } from '../../shared/domain/attribute-values.ts';
import type { AttributeDefinitionRef } from '../../shared/resources/attribute-definition.ts';
import type { ControlledAttributeValueRef } from '../../shared/resources/controlled-attribute-value.ts';
import {
  attributeDefinitionRevisions,
  attributeDefinitions,
  attributeValueItems,
  attributeValueSets,
  controlledAttributeValueRevisions,
  controlledAttributeValues,
  productTypeRevisionAttributes,
  productTypes,
  productVariantAxes,
  productVariants,
} from '../database/schema.ts';
import { CatalogPersistenceUnavailable } from './errors.ts';
import { AttributePersistenceNotFound } from './attribute-persistence-not-found.ts';

export { AttributePersistenceNotFound } from './attribute-persistence-not-found.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export class AttributePersistenceConflict extends Schema.TaggedError<AttributePersistenceConflict>()(
  'AttributePersistenceConflict',
  {
    code: Schema.Literal('attribute_persistence_conflict'),
    conflict: Schema.Literals(['IDENTITY', 'ACTION_INVOCATION_ID', 'REVISION', 'INVALID_STATE', 'INVALID_INPUT']),
    reason: Schema.String,
  },
) {}

const unavailable = (cause: unknown): CatalogPersistenceUnavailable => {
  const failure = new CatalogPersistenceUnavailable({
    code: 'catalog_persistence_unavailable',
    reason: 'Catalog persistence is temporarily unavailable',
  });
  Object.defineProperty(failure, 'cause', { configurable: true, value: cause });
  return failure;
};

export const mapAttributeWriteError = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Core's PostgreSQL classifier parses this opaque driver cause; only typed failures leave this adapter. expires: 2027-03-31.
  error: unknown,
): AttributePersistenceConflict | CatalogPersistenceUnavailable => {
  const uniqueViolationSqlState = ['23', '505'].join('');
  const violation = findPostgresFailure(
    error,
    ({ code, constraint }) =>
      code === uniqueViolationSqlState &&
      [
        'attribute_definitions_pkey',
        'controlled_attribute_values_pkey',
        'catalog_attribute_definitions_scope_id_uk',
        'catalog_controlled_values_scope_id_uk',
      ].includes(constraint ?? ''),
  );
  if (Option.isSome(violation)) {
    return new AttributePersistenceConflict({
      code: 'attribute_persistence_conflict',
      conflict: 'IDENTITY',
      reason: 'Attribute identity already exists',
    });
  }
  const invocation = findPostgresFailure(
    error,
    ({ code, constraint }) =>
      code === uniqueViolationSqlState &&
      [
        'catalog_attribute_definition_revisions_invocation_uk',
        'catalog_controlled_value_revisions_invocation_uk',
      ].includes(constraint ?? ''),
  );
  if (Option.isSome(invocation)) {
    return new AttributePersistenceConflict({
      code: 'attribute_persistence_conflict',
      conflict: 'ACTION_INVOCATION_ID',
      reason: 'Action invocation already recorded',
    });
  }
  return unavailable(error);
};

interface ChangeMetadata {
  readonly actionInvocationId: string;
  readonly effectiveAt: Date;
  readonly evidenceRefs?: readonly string[];
  readonly principalId: string;
  readonly reason: string;
}

export interface CreateAttributeDefinitionInput extends ChangeMetadata {
  readonly allowsNone: boolean;
  readonly allowsNotApplicable: boolean;
  readonly allowsUnknown: boolean;
  readonly applicableLevels: readonly ('PRODUCT' | 'VARIANT')[];
  readonly canonicalUnit?: string | null;
  readonly controlledValueKind?: 'GENERAL' | 'COLOR' | 'SIZE' | null | undefined;
  readonly decimalPlaces?: number | null;
  readonly maximumValue?: string | null;
  readonly meaning: string;
  readonly measuredQuantity?: string | null;
  readonly minimumValue?: string | null;
  readonly multiplicity: 'SINGLE' | 'MULTIPLE';
  readonly name: string;
  readonly valueKind: 'TEXT' | 'CONTROLLED' | 'MEASUREMENT';
}

export interface RenameAttributeDefinitionInput extends ChangeMetadata {
  readonly attributeDefinitionRef: AttributeDefinitionRef;
  readonly evidence: string;
  readonly expectedRevision: number;
  readonly name: string;
  readonly sameMeaning: true;
}

/** The open-selection check must be an authoritative owner-local read in this same transaction. */
export interface ReviseAttributeDefinitionRulesInput extends ChangeMetadata {
  readonly attributeDefinitionRef: AttributeDefinitionRef;
  readonly checkOpenSelections: Effect.Effect<boolean, CatalogPersistenceUnavailable>;
  readonly evidence: string;
  readonly expectedRevision: number;
  readonly proposed: AttributeDefinition;
  readonly sameMeaning: true;
}

export interface CreateControlledAttributeValueInput extends ChangeMetadata {
  readonly attributeDefinitionRef: AttributeDefinitionRef;
  readonly colorGroup?: string | undefined;
  readonly meaning: string;
  readonly name: string;
  readonly previewHex?: string | undefined;
  readonly specialization: 'GENERAL' | 'COLOR' | 'SIZE';
  readonly swatchCode?: string | undefined;
  readonly swatchSystem?: string | undefined;
}

export interface ChangeControlledAttributeValueInput extends ChangeMetadata {
  readonly controlledValueRef: ControlledAttributeValueRef;
  readonly evidence: string;
  readonly expectedRevision: number;
}

export interface RenameControlledAttributeValueInput extends ChangeControlledAttributeValueInput {
  readonly name: string;
  readonly sameMeaning: true;
}

export interface ReactivateControlledAttributeValueInput extends ChangeControlledAttributeValueInput {
  readonly currentMeaningConfirmed: true;
}

const conflict = (kind: AttributePersistenceConflict['conflict'], reason: string) =>
  new AttributePersistenceConflict({ code: 'attribute_persistence_conflict', conflict: kind, reason });
const notFound = (resource: 'DEFINITION' | 'CONTROLLED_VALUE') =>
  new AttributePersistenceNotFound({
    code: 'attribute_persistence_not_found',
    reason: 'Attribute resource not found',
    resource,
  });
const validText = (value: string, max: number) => value === value.trim() && value.length > 0 && value.length <= max;
const CATALOG_MODULE_ID = 'commerce.catalog';
const validRef = (ref: AttributeDefinitionRef | ControlledAttributeValueRef, tenantId: string, resourceType: string) =>
  ref.tenantId === tenantId && ref.moduleId === CATALOG_MODULE_ID && ref.resourceType === resourceType;
const validDefinitionRef = (ref: AttributeDefinitionRef, tenantId: string) =>
  validRef(ref, tenantId, 'commerce.catalog.attribute-definition');
const validControlledValueRef = (ref: ControlledAttributeValueRef, tenantId: string) =>
  validRef(ref, tenantId, 'commerce.catalog.controlled-attribute-value');
const validControlledInput = (input: CreateControlledAttributeValueInput, tenantId: string) =>
  validDefinitionRef(input.attributeDefinitionRef, tenantId) &&
  validText(input.name, 240) &&
  validText(input.meaning, 1000) &&
  validText(input.reason, 1000);
const hasColorMetadata = (input: CreateControlledAttributeValueInput) =>
  input.colorGroup !== undefined ||
  input.previewHex !== undefined ||
  input.swatchSystem !== undefined ||
  input.swatchCode !== undefined;

export interface AttributeImpactSnapshot {
  readonly directProducts: readonly string[];
  readonly directVariants: readonly string[];
  readonly inheritedVariants: readonly string[];
  readonly productTypes: readonly string[];
  readonly variantAxisProducts: readonly string[];
}

const hasAttributeImpact = (impact: AttributeImpactSnapshot): boolean =>
  impact.directProducts.length +
    impact.directVariants.length +
    impact.inheritedVariants.length +
    impact.productTypes.length +
    impact.variantAxisProducts.length >
  0;

const proposedRuleSnapshot = (proposed: AttributeDefinition) => ({
  allowsNone: proposed.specialStates.includes('NONE') ? 1 : 0,
  allowsNotApplicable: proposed.specialStates.includes('NOT_APPLICABLE') ? 1 : 0,
  allowsUnknown: proposed.specialStates.includes('UNKNOWN') ? 1 : 0,
  applicableLevels: [...proposed.levels].toSorted(),
  canonicalUnit: proposed.measurement?.canonicalUnit ?? null,
  decimalPlaces: proposed.measurement?.decimalPlaces ?? null,
  maximumValue: proposed.measurement?.maximum?.toString() ?? null,
  measuredQuantity: proposed.measurement?.quantity ?? null,
  minimumValue: proposed.measurement?.minimum?.toString() ?? null,
  multiplicity: proposed.multiplicity,
});

const currentRuleSnapshot = (current: typeof attributeDefinitions.$inferSelect) => ({
  allowsNone: current.allowsNone,
  allowsNotApplicable: current.allowsNotApplicable,
  allowsUnknown: current.allowsUnknown,
  applicableLevels: [...current.applicableLevels].toSorted(),
  canonicalUnit: current.canonicalUnit,
  decimalPlaces: current.decimalPlaces,
  maximumValue: current.maximumValue,
  measuredQuantity: current.measuredQuantity,
  minimumValue: current.minimumValue,
  multiplicity: current.multiplicity,
});

const validRuleRevisionInput = (input: ReviseAttributeDefinitionRulesInput, tenantId: string): boolean =>
  validDefinitionRef(input.attributeDefinitionRef, tenantId) &&
  Schema.is(AttributeDefinitionSchema)(input.proposed) &&
  input.proposed.ref.resourceId === input.attributeDefinitionRef.resourceId &&
  input.proposed.ref.tenantId === tenantId &&
  input.sameMeaning &&
  validText(input.evidence, 1000) &&
  validText(input.reason, 1000);

const preservesDefinitionMeaning = (
  current: typeof attributeDefinitions.$inferSelect,
  proposed: AttributeDefinition,
): boolean =>
  proposed.meaning === current.meaning &&
  proposed.valueKind === current.valueKind &&
  proposed.label === current.name &&
  proposed.measurement?.quantity === (current.measuredQuantity ?? undefined) &&
  (current.valueKind !== 'CONTROLLED' || current.controlledValueKind !== null);

interface ImpactRows {
  readonly axisProductIds: readonly string[];
  readonly controlledValueId?: string | undefined;
  readonly items: readonly Pick<
    typeof attributeValueItems.$inferSelect,
    'attributeValueSetId' | 'controlledAttributeValueId'
  >[];
  readonly productTypeIds: readonly string[];
  readonly sets: readonly Pick<
    typeof attributeValueSets.$inferSelect,
    'attributeValueSetId' | 'productId' | 'variantId' | 'currentState'
  >[];
  readonly variants: readonly Pick<typeof productVariants.$inferSelect, 'productId' | 'variantId'>[];
}

/** A current impact is derived from live sets only; revision rows are never rewritten or counted as current. */
export const deriveAttributeImpact = (rows: ImpactRows): AttributeImpactSnapshot => {
  const matchingSetIds = new Set<string>();
  if (rows.controlledValueId !== undefined) {
    for (const item of rows.items) {
      if (item.controlledAttributeValueId === rows.controlledValueId) {
        matchingSetIds.add(item.attributeValueSetId);
      }
    }
  }
  const productSources = new Set<string>();
  const overriddenVariants = new Set<string>();
  const directVariants = new Set<string>();
  for (const set of rows.sets) {
    if (set.currentState !== 'SET') {
      continue;
    }
    const matches = rows.controlledValueId === undefined || matchingSetIds.has(set.attributeValueSetId);
    if (set.variantId === null) {
      if (matches) {
        productSources.add(set.productId);
      }
    } else {
      overriddenVariants.add(set.variantId);
      if (matches) {
        directVariants.add(set.variantId);
      }
    }
  }
  const inheritedVariants: string[] = [];
  for (const variant of rows.variants) {
    if (productSources.has(variant.productId) && !overriddenVariants.has(variant.variantId)) {
      inheritedVariants.push(variant.variantId);
    }
  }
  return {
    directProducts: [...productSources].toSorted(),
    directVariants: [...directVariants].toSorted(),
    inheritedVariants: inheritedVariants.toSorted(),
    productTypes: [...new Set(rows.productTypeIds)].toSorted(),
    variantAxisProducts: [...new Set(rows.axisProductIds)].toSorted(),
  };
};

/** Transaction-scoped current impact for a future #479 attestation; open selections require a separate authority. */
export const inspectAttributeImpactForScope = Effect.fn('AttributePersistence.inspectAttributeImpactForScope')(
  function* inspectAttributeImpact(
    transaction: ScopedTransaction,
    scope: OperationalScope,
    attributeDefinitionRef: AttributeDefinitionRef,
    controlledValueRef?: ControlledAttributeValueRef,
  ) {
    const { tenantId } = scope;
    if (
      !validDefinitionRef(attributeDefinitionRef, tenantId) ||
      (controlledValueRef !== undefined && !validControlledValueRef(controlledValueRef, tenantId))
    ) {
      return yield* conflict('INVALID_INPUT', 'Attribute impact reference is outside the trusted Tenant');
    }
    const definitionId = attributeDefinitionRef.resourceId;
    const [definition] = yield* transaction
      .select({ attributeDefinitionId: attributeDefinitions.attributeDefinitionId })
      .from(attributeDefinitions)
      .where(
        and(eq(attributeDefinitions.tenantId, tenantId), eq(attributeDefinitions.attributeDefinitionId, definitionId)),
      )
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (definition === undefined) {
      return yield* notFound('DEFINITION');
    }
    if (controlledValueRef !== undefined) {
      const [value] = yield* transaction
        .select({ attributeDefinitionId: controlledAttributeValues.attributeDefinitionId })
        .from(controlledAttributeValues)
        .where(
          and(
            eq(controlledAttributeValues.tenantId, tenantId),
            eq(controlledAttributeValues.controlledAttributeValueId, controlledValueRef.resourceId),
          ),
        )
        .limit(1)
        .pipe(Effect.mapError(unavailable));
      if (value === undefined || value.attributeDefinitionId !== definitionId) {
        return yield* notFound('CONTROLLED_VALUE');
      }
    }
    const { axes, items, sets, typeRules, types, variants } = yield* Effect.all(
      {
        axes: transaction
          .select({ productId: productVariantAxes.productId })
          .from(productVariantAxes)
          .where(
            and(eq(productVariantAxes.tenantId, tenantId), eq(productVariantAxes.attributeDefinitionId, definitionId)),
          )
          .pipe(Effect.mapError(unavailable)),
        items: transaction
          .select({
            attributeValueSetId: attributeValueItems.attributeValueSetId,
            controlledAttributeValueId: attributeValueItems.controlledAttributeValueId,
          })
          .from(attributeValueItems)
          .where(
            and(
              eq(attributeValueItems.tenantId, tenantId),
              eq(attributeValueItems.attributeDefinitionId, definitionId),
            ),
          )
          .pipe(Effect.mapError(unavailable)),
        sets: transaction
          .select({
            attributeValueSetId: attributeValueSets.attributeValueSetId,
            currentState: attributeValueSets.currentState,
            productId: attributeValueSets.productId,
            variantId: attributeValueSets.variantId,
          })
          .from(attributeValueSets)
          .where(
            and(eq(attributeValueSets.tenantId, tenantId), eq(attributeValueSets.attributeDefinitionId, definitionId)),
          )
          .pipe(Effect.mapError(unavailable)),
        typeRules: transaction
          .select({
            productTypeId: productTypeRevisionAttributes.productTypeId,
            revision: productTypeRevisionAttributes.revision,
          })
          .from(productTypeRevisionAttributes)
          .where(
            and(
              eq(productTypeRevisionAttributes.tenantId, tenantId),
              eq(productTypeRevisionAttributes.attributeDefinitionId, definitionId),
            ),
          )
          .pipe(Effect.mapError(unavailable)),
        types: transaction
          .select({ currentRevision: productTypes.currentRevision, productTypeId: productTypes.productTypeId })
          .from(productTypes)
          .where(eq(productTypes.tenantId, tenantId))
          .pipe(Effect.mapError(unavailable)),
        variants: transaction
          .select({ productId: productVariants.productId, variantId: productVariants.variantId })
          .from(productVariants)
          .where(eq(productVariants.tenantId, tenantId))
          .pipe(Effect.mapError(unavailable)),
      },
      { concurrency: 6 },
    );
    const currentTypeRevisions = new Set(types.map((type) => `${type.productTypeId}:${type.currentRevision}`));
    const productTypeIds: string[] = [];
    for (const rule of typeRules) {
      if (currentTypeRevisions.has(`${rule.productTypeId}:${rule.revision}`)) {
        productTypeIds.push(rule.productTypeId);
      }
    }
    return deriveAttributeImpact({
      axisProductIds: axes.map((axis) => axis.productId),
      controlledValueId: controlledValueRef?.resourceId,
      items,
      productTypeIds,
      sets,
      variants,
    });
  },
);

/** All methods run only on the Core-owned, tenant-scoped Action transaction. */
export const attributePersistenceForScope = (transaction: ScopedTransaction, scope: OperationalScope) => {
  const { tenantId } = scope;
  const createDefinition = Effect.fn('AttributePersistence.createDefinition')(function* createDefinition(
    input: CreateAttributeDefinitionInput,
  ) {
    if (!validText(input.name, 240) || !validText(input.meaning, 1000) || !validText(input.reason, 1000)) {
      return yield* conflict('INVALID_INPUT', 'Invalid attribute definition input');
    }
    if (
      input.applicableLevels.length < 1 ||
      input.applicableLevels.length > 2 ||
      new Set(input.applicableLevels).size !== input.applicableLevels.length ||
      input.applicableLevels.some((level) => level !== 'PRODUCT' && level !== 'VARIANT')
    ) {
      return yield* conflict('INVALID_INPUT', 'Invalid attribute applicability levels');
    }
    if (
      (input.valueKind === 'CONTROLLED') !==
      (input.controlledValueKind !== null && input.controlledValueKind !== undefined)
    ) {
      return yield* conflict('INVALID_INPUT', 'Controlled definition specialization is missing or inapplicable');
    }
    const attributeDefinitionId = randomUUID();
    const snapshot = {
      allowsNone: input.allowsNone ? 1 : 0,
      allowsNotApplicable: input.allowsNotApplicable ? 1 : 0,
      allowsUnknown: input.allowsUnknown ? 1 : 0,
      applicableLevels: [...input.applicableLevels],
      attributeDefinitionId,
      canonicalUnit: input.canonicalUnit ?? null,
      controlledValueKind: input.controlledValueKind ?? null,
      decimalPlaces: input.decimalPlaces ?? null,
      maximumValue: input.maximumValue ?? null,
      meaning: input.meaning,
      measuredQuantity: input.measuredQuantity ?? null,
      minimumValue: input.minimumValue ?? null,
      multiplicity: input.multiplicity,
      name: input.name,
      tenantId,
      valueKind: input.valueKind,
    };
    yield* transaction
      .insert(attributeDefinitions)
      .values({
        ...snapshot,
        createdByActionInvocationId: input.actionInvocationId,
        createdByPrincipalId: input.principalId,
        currentRevision: 1,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    yield* transaction
      .insert(attributeDefinitionRevisions)
      .values({
        ...snapshot,
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        effectiveAt: input.effectiveAt,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        reason: input.reason,
        revision: 1,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    return {
      attributeDefinitionRef: {
        moduleId: CATALOG_MODULE_ID,
        resourceId: attributeDefinitionId,
        resourceType: 'commerce.catalog.attribute-definition' as const,
        tenantId,
      },
      revision: 1,
    };
  });

  const renameDefinition = Effect.fn('AttributePersistence.renameDefinition')(function* renameDefinition(
    input: RenameAttributeDefinitionInput,
  ) {
    if (!validDefinitionRef(input.attributeDefinitionRef, tenantId)) {
      return yield* conflict('INVALID_INPUT', 'Attribute reference is outside the trusted Tenant');
    }
    if (
      !input.sameMeaning ||
      !validText(input.evidence, 1000) ||
      !validText(input.name, 240) ||
      !validText(input.reason, 1000)
    ) {
      return yield* conflict('INVALID_INPUT', 'Rename requires evidence of unchanged meaning');
    }
    const id = input.attributeDefinitionRef.resourceId;
    const [current] = yield* transaction
      .select()
      .from(attributeDefinitions)
      .where(and(eq(attributeDefinitions.tenantId, tenantId), eq(attributeDefinitions.attributeDefinitionId, id)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (current === undefined) {
      return yield* notFound('DEFINITION');
    }
    if (current.currentRevision !== input.expectedRevision) {
      return yield* conflict('REVISION', 'Attribute definition revision changed');
    }
    if (current.name === input.name) {
      return {
        attributeDefinitionRef: input.attributeDefinitionRef,
        changed: false,
        revision: current.currentRevision,
      };
    }
    const revision = current.currentRevision + 1;
    yield* transaction
      .update(attributeDefinitions)
      .set({ currentRevision: revision, name: input.name })
      .where(and(eq(attributeDefinitions.tenantId, tenantId), eq(attributeDefinitions.attributeDefinitionId, id)))
      .pipe(Effect.mapError(mapAttributeWriteError));
    yield* transaction
      .insert(attributeDefinitionRevisions)
      .values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        allowsNone: current.allowsNone,
        allowsNotApplicable: current.allowsNotApplicable,
        allowsUnknown: current.allowsUnknown,
        applicableLevels: current.applicableLevels,
        attributeDefinitionId: id,
        canonicalUnit: current.canonicalUnit,
        controlledValueKind: current.controlledValueKind,
        decimalPlaces: current.decimalPlaces,
        effectiveAt: input.effectiveAt,
        evidenceRefs: [...(input.evidenceRefs ?? []), input.evidence],
        maximumValue: current.maximumValue,
        meaning: current.meaning,
        measuredQuantity: current.measuredQuantity,
        minimumValue: current.minimumValue,
        multiplicity: current.multiplicity,
        name: input.name,
        reason: input.reason,
        revision,
        tenantId,
        valueKind: current.valueKind,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    return { attributeDefinitionRef: input.attributeDefinitionRef, changed: true, revision };
  });

  const reviseDefinitionRules = Effect.fn('AttributePersistence.reviseDefinitionRules')(function* reviseDefinitionRules(
    input: ReviseAttributeDefinitionRulesInput,
  ) {
    if (!validRuleRevisionInput(input, tenantId)) {
      return yield* conflict('INVALID_INPUT', 'Rule revision requires a valid same-meaning proposal and evidence');
    }
    const id = input.attributeDefinitionRef.resourceId;
    const [current] = yield* transaction
      .select()
      .from(attributeDefinitions)
      .where(and(eq(attributeDefinitions.tenantId, tenantId), eq(attributeDefinitions.attributeDefinitionId, id)))
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (current === undefined) {
      return yield* notFound('DEFINITION');
    }
    if (current.currentRevision !== input.expectedRevision) {
      return yield* conflict('REVISION', 'Attribute definition revision changed');
    }
    const { proposed } = input;
    if (!preservesDefinitionMeaning(current, proposed)) {
      return yield* conflict('INVALID_INPUT', 'Changed meaning or value kind requires a new definition');
    }
    const proposedRules = proposedRuleSnapshot(proposed);
    if (isDeepStrictEqual(proposedRules, currentRuleSnapshot(current))) {
      return {
        attributeDefinitionRef: input.attributeDefinitionRef,
        changed: false,
        revision: current.currentRevision,
      };
    }
    const impact = yield* inspectAttributeImpactForScope(transaction, scope, input.attributeDefinitionRef);
    if (hasAttributeImpact(impact)) {
      return yield* conflict(
        'INVALID_STATE',
        'Existing values, type rules, or axes require explicit remediation before rule revision',
      );
    }
    if (!(yield* input.checkOpenSelections)) {
      return yield* conflict('INVALID_STATE', 'Open selection impact is not proven clear');
    }
    const revision = current.currentRevision + 1;
    const rules = proposedRules;
    yield* transaction
      .update(attributeDefinitions)
      .set({ ...rules, currentRevision: revision })
      .where(and(eq(attributeDefinitions.tenantId, tenantId), eq(attributeDefinitions.attributeDefinitionId, id)))
      .pipe(Effect.mapError(mapAttributeWriteError));
    yield* transaction
      .insert(attributeDefinitionRevisions)
      .values({
        ...rules,
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        attributeDefinitionId: id,
        controlledValueKind: current.controlledValueKind,
        effectiveAt: input.effectiveAt,
        evidenceRefs: [...(input.evidenceRefs ?? []), input.evidence],
        meaning: current.meaning,
        name: current.name,
        reason: input.reason,
        revision,
        tenantId,
        valueKind: current.valueKind,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    return { attributeDefinitionRef: input.attributeDefinitionRef, changed: true, revision };
  });

  const createControlledValue = Effect.fn('AttributePersistence.createControlledValue')(function* createControlledValue(
    input: CreateControlledAttributeValueInput,
  ) {
    if (!validControlledInput(input, tenantId)) {
      return yield* conflict('INVALID_INPUT', 'Invalid controlled value input');
    }
    if (input.specialization !== 'COLOR' && hasColorMetadata(input)) {
      return yield* conflict('INVALID_INPUT', 'Color metadata does not match specialization');
    }
    if ((input.swatchSystem === undefined) !== (input.swatchCode === undefined)) {
      return yield* conflict('INVALID_INPUT', 'Color swatch system and code must be paired');
    }
    if (input.specialization === 'COLOR' && (input.evidenceRefs?.length ?? 0) === 0) {
      return yield* conflict('INVALID_INPUT', 'Color distinction evidence is required');
    }
    const [definition] = yield* transaction
      .select({
        controlledValueKind: attributeDefinitions.controlledValueKind,
        valueKind: attributeDefinitions.valueKind,
      })
      .from(attributeDefinitions)
      .where(
        and(
          eq(attributeDefinitions.tenantId, tenantId),
          eq(attributeDefinitions.attributeDefinitionId, input.attributeDefinitionRef.resourceId),
        ),
      )
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (definition === undefined) {
      return yield* notFound('DEFINITION');
    }
    if (definition.valueKind !== 'CONTROLLED') {
      return yield* conflict('INVALID_STATE', 'Definition does not own controlled values');
    }
    if (definition.controlledValueKind !== input.specialization) {
      return yield* conflict('INVALID_STATE', 'Controlled value specialization differs from its definition');
    }
    const controlledAttributeValueId = randomUUID();
    const snapshot = {
      attributeDefinitionId: input.attributeDefinitionRef.resourceId,
      colorGroup: input.colorGroup ?? null,
      controlledAttributeValueId,
      lifecycleState: 'ACTIVE',
      meaning: input.meaning,
      name: input.name,
      previewEvidenceRef: null,
      previewHex: input.previewHex ?? null,
      specialization: input.specialization,
      swatchCode: input.swatchCode ?? null,
      swatchSystem: input.swatchSystem ?? null,
      tenantId,
    };
    yield* transaction
      .insert(controlledAttributeValues)
      .values({
        ...snapshot,
        createdByActionInvocationId: input.actionInvocationId,
        createdByPrincipalId: input.principalId,
        currentRevision: 1,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    yield* transaction
      .insert(controlledAttributeValueRevisions)
      .values({
        ...snapshot,
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        effectiveAt: input.effectiveAt,
        evidenceRefs: [...(input.evidenceRefs ?? [])],
        reason: input.reason,
        revision: 1,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    return {
      controlledValueRef: {
        moduleId: CATALOG_MODULE_ID,
        resourceId: controlledAttributeValueId,
        resourceType: 'commerce.catalog.controlled-attribute-value' as const,
        tenantId,
      },
      revision: 1,
    };
  });

  const changeValue = Effect.fn('AttributePersistence.changeValue')(function* changeValue(
    input: ChangeControlledAttributeValueInput,
    change: { lifecycleState?: 'ACTIVE' | 'RETIRED'; name?: string },
  ) {
    if (
      !validControlledValueRef(input.controlledValueRef, tenantId) ||
      !validText(input.evidence, 1000) ||
      !validText(input.reason, 1000)
    ) {
      return yield* conflict('INVALID_INPUT', 'Controlled value change requires evidence');
    }
    const id = input.controlledValueRef.resourceId;
    const [current] = yield* transaction
      .select()
      .from(controlledAttributeValues)
      .where(
        and(
          eq(controlledAttributeValues.tenantId, tenantId),
          eq(controlledAttributeValues.controlledAttributeValueId, id),
        ),
      )
      .for('update')
      .limit(1)
      .pipe(Effect.mapError(unavailable));
    if (current === undefined) {
      return yield* notFound('CONTROLLED_VALUE');
    }
    if (current.currentRevision !== input.expectedRevision) {
      return yield* conflict('REVISION', 'Controlled value revision changed');
    }
    const name = change.name ?? current.name;
    const lifecycleState = change.lifecycleState ?? current.lifecycleState;
    if (name === current.name && lifecycleState === current.lifecycleState) {
      return {
        changed: false,
        controlledValueRef: input.controlledValueRef,
        lifecycle: current.lifecycleState,
        revision: current.currentRevision,
      };
    }
    const revision = current.currentRevision + 1;
    yield* transaction
      .update(controlledAttributeValues)
      .set({ currentRevision: revision, lifecycleState, name })
      .where(
        and(
          eq(controlledAttributeValues.tenantId, tenantId),
          eq(controlledAttributeValues.controlledAttributeValueId, id),
        ),
      )
      .pipe(Effect.mapError(mapAttributeWriteError));
    yield* transaction
      .insert(controlledAttributeValueRevisions)
      .values({
        actingPrincipalId: input.principalId,
        actionInvocationId: input.actionInvocationId,
        attributeDefinitionId: current.attributeDefinitionId,
        colorGroup: current.colorGroup,
        controlledAttributeValueId: id,
        effectiveAt: input.effectiveAt,
        evidenceRefs: [...(input.evidenceRefs ?? []), input.evidence],
        lifecycleState,
        meaning: current.meaning,
        name,
        previewEvidenceRef: current.previewEvidenceRef,
        previewHex: current.previewHex,
        reason: input.reason,
        revision,
        specialization: current.specialization,
        swatchCode: current.swatchCode,
        swatchSystem: current.swatchSystem,
        tenantId,
      })
      .pipe(Effect.mapError(mapAttributeWriteError));
    return { changed: true, controlledValueRef: input.controlledValueRef, lifecycle: lifecycleState, revision };
  });

  return Effect.succeed({
    createControlledValue,
    createDefinition,
    reactivateControlledValue: (input: ReactivateControlledAttributeValueInput) =>
      input.currentMeaningConfirmed
        ? changeValue(input, { lifecycleState: 'ACTIVE' })
        : Effect.fail(conflict('INVALID_INPUT', 'Reactivation requires current meaning confirmation')),
    renameControlledValue: (input: RenameControlledAttributeValueInput) =>
      input.sameMeaning && validText(input.name, 240)
        ? changeValue(input, { name: input.name })
        : Effect.fail(conflict('INVALID_INPUT', 'Rename requires unchanged meaning and a valid name')),
    renameDefinition,
    retireControlledValue: (input: ChangeControlledAttributeValueInput) =>
      changeValue(input, { lifecycleState: 'RETIRED' }),
    reviseDefinitionRules,
  });
};

export type AttributePersistence = Effect.Success<ReturnType<typeof attributePersistenceForScope>>;
