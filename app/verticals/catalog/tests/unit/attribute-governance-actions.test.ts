import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  CreateAttributeDefinitionPayloadSchema,
  CreateControlledAttributeValuePayloadSchema,
  ReactivateControlledAttributeValuePayloadSchema,
  RenameAttributeDefinitionPayloadSchema,
  RenameControlledAttributeValuePayloadSchema,
} from '../../shared/actions/attribute-governance.ts';
import { createAttributeDefinitionAction } from '../../src/actions/create-attribute-definition.action.ts';
import { createControlledAttributeValueAction } from '../../src/actions/create-controlled-attribute-value.action.ts';
import { reactivateControlledAttributeValueAction } from '../../src/actions/reactivate-controlled-attribute-value.action.ts';
import { renameAttributeDefinitionAction } from '../../src/actions/rename-attribute-definition.action.ts';
import { renameControlledAttributeValueAction } from '../../src/actions/rename-controlled-attribute-value.action.ts';
import { retireControlledAttributeValueAction } from '../../src/actions/retire-controlled-attribute-value.action.ts';
import {
  AttributePersistenceConflict,
  AttributePersistenceNotFound,
} from '../../src/persistence/attribute-persistence.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const definitionRef = {
  moduleId: 'commerce.catalog',
  resourceId: '22222222-2222-4222-8222-222222222222',
  resourceType: 'commerce.catalog.attribute-definition',
  tenantId,
};
const controlledValueRef = {
  moduleId: 'commerce.catalog',
  resourceId: '33333333-3333-4333-8333-333333333333',
  resourceType: 'commerce.catalog.controlled-attribute-value',
  tenantId,
};

describe('Catalog attribute governance Actions', () => {
  it('requires an explicit stable meaning and valid shape for a new definition', () => {
    const base = {
      controlledValueKind: 'GENERAL',
      label: 'Material',
      levels: ['PRODUCT'],
      meaning: 'Constituent material of the product',
      multiplicity: 'MULTIPLE',
      reason: 'New shared product fact',
      specialStates: [],
      valueKind: 'CONTROLLED',
    };
    expect(Schema.is(CreateAttributeDefinitionPayloadSchema)(base)).toBe(true);
    expect(Schema.is(CreateAttributeDefinitionPayloadSchema)({ ...base, meaning: '' })).toBe(false);
    expect(Schema.is(CreateAttributeDefinitionPayloadSchema)({ ...base, reason: '' })).toBe(false);
  });

  it('does not allow a rename to silently change meaning', () => {
    const definitionRename = {
      attributeDefinitionRef: definitionRef,
      evidence: 'Same constituent material question',
      expectedRevision: 1,
      label: 'Product material',
      reason: 'Clarify label',
      sameMeaning: true,
    };
    const valueRename = {
      controlledValueRef,
      evidence: 'Typo correction only',
      expectedRevision: 1,
      label: 'Stainless steel',
      reason: 'Correct label',
      sameMeaning: true,
    };
    expect(Schema.is(RenameAttributeDefinitionPayloadSchema)(definitionRename)).toBe(true);
    expect(Schema.is(RenameControlledAttributeValuePayloadSchema)(valueRename)).toBe(true);
    expect(Schema.is(RenameAttributeDefinitionPayloadSchema)({ ...definitionRename, sameMeaning: false })).toBe(false);
    expect(Schema.is(RenameControlledAttributeValuePayloadSchema)({ ...valueRename, evidence: '' })).toBe(false);
  });

  it('requires Color-specific evidence and explicit reactivation review', () => {
    const base = {
      attributeDefinitionRef: definitionRef,
      label: 'Anthracite',
      meaning: 'Supplier shade A',
      reason: 'Add documented color',
      specialization: 'COLOR',
    };
    expect(Schema.is(CreateControlledAttributeValuePayloadSchema)(base)).toBe(false);
    expect(
      Schema.is(CreateControlledAttributeValuePayloadSchema)({
        ...base,
        color: { distinguishingEvidence: 'Supplier sample A', previewHex: '#444444' },
      }),
    ).toBe(true);
    expect(
      Schema.is(ReactivateControlledAttributeValuePayloadSchema)({
        controlledValueRef,
        currentMeaningConfirmed: false,
        evidence: 'Review',
        expectedRevision: 2,
        reason: 'Restore use',
      }),
    ).toBe(false);
  });

  it('keeps every governed mutation tenant-scoped, explicit-permission and idempotent', () => {
    for (const action of [
      createAttributeDefinitionAction,
      renameAttributeDefinitionAction,
      createControlledAttributeValueAction,
      renameControlledAttributeValueAction,
      retireControlledAttributeValueAction,
      reactivateControlledAttributeValueAction,
    ]) {
      expect(action.descriptor.entrypoint.scope).toBe('tenant');
      expect(action.descriptor.entrypoint.authorization).toEqual({
        kind: 'action_execution',
        provisioning: 'explicit',
      });
      expect(action.descriptor.legalEntityScope).toBe('forbidden');
      expect(action.descriptor.idempotency).toBe('required');
    }
  });

  it('declares typed conflict and missing-resource outcomes for governed changes', () => {
    const conflict = new AttributePersistenceConflict({
      code: 'attribute_persistence_conflict',
      conflict: 'REVISION',
      reason: 'Revision changed',
    });
    const missing = new AttributePersistenceNotFound({
      code: 'attribute_persistence_not_found',
      reason: 'Not found in trusted Tenant',
      resource: 'CONTROLLED_VALUE',
    });
    expect(Schema.is(renameAttributeDefinitionAction.descriptor.domainErrorSchema)(conflict)).toBe(true);
    expect(Schema.is(reactivateControlledAttributeValueAction.descriptor.domainErrorSchema)(missing)).toBe(true);
  });
});
