import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { findPostgresFailure } from '@app/core-runtime';
import { and, eq } from 'drizzle-orm';
import { Effect, Option, Schema } from 'effect';
import { randomUUID } from 'node:crypto';

import type { AttributeDefinitionRef } from '../../shared/resources/attribute-definition.ts';
import type { ControlledAttributeValueRef } from '../../shared/resources/controlled-attribute-value.ts';
import {
  attributeDefinitionRevisions,
  attributeDefinitions,
  controlledAttributeValueRevisions,
  controlledAttributeValues,
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
const validRef = (ref: AttributeDefinitionRef | ControlledAttributeValueRef, tenantId: string) =>
  ref.tenantId === tenantId && ref.moduleId === CATALOG_MODULE_ID;
const validControlledInput = (input: CreateControlledAttributeValueInput, tenantId: string) =>
  validRef(input.attributeDefinitionRef, tenantId) &&
  validText(input.name, 240) &&
  validText(input.meaning, 1000) &&
  validText(input.reason, 1000);
const hasColorMetadata = (input: CreateControlledAttributeValueInput) =>
  input.colorGroup !== undefined ||
  input.previewHex !== undefined ||
  input.swatchSystem !== undefined ||
  input.swatchCode !== undefined;

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
    if (!validRef(input.attributeDefinitionRef, tenantId)) {
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
      !validRef(input.controlledValueRef, tenantId) ||
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
  });
};

export type AttributePersistence = Effect.Success<ReturnType<typeof attributePersistenceForScope>>;
