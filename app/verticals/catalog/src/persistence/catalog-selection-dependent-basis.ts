import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Option } from 'effect';

import type { CatalogSelection } from '../../shared/domain/catalog-selection-evidence.ts';
import type { SetComponentCurrentProof } from '../../shared/domain/set-component-validation.ts';
import { validateSetComponents } from '../../shared/domain/set-component-validation.ts';
import { evaluateCurrentProductConfiguration } from './product-configuration-current-evaluator.ts';
import type {
  CurrentConfigurationValue,
  TrustedConfigurationTarget,
} from './product-configuration-current-evaluator.ts';
import { productConfigurationPersistenceForScope } from './product-configuration-persistence.ts';
import { setCompositionPersistenceForScope } from './set-composition-persistence.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

export type DependentBasisResult =
  | { readonly status: 'VALID' }
  | { readonly reason: string; readonly status: 'INVALID' | 'INDETERMINATE' };

/** A proof must be minted from this transaction and instant by the Catalog owner. */
export interface SetComponentProofSource {
  readonly read: (input: {
    readonly at: Date;
    readonly componentId: string;
    readonly selection: CatalogSelection;
  }) => Effect.Effect<Option.Option<SetComponentCurrentProof>>;
}

const catalogModuleId = 'commerce.catalog';
const unknown = (reason: string): DependentBasisResult => ({ reason, status: 'INDETERMINATE' });
const invalid = (reason: string): DependentBasisResult => ({ reason, status: 'INVALID' });
const valid: DependentBasisResult = { status: 'VALID' };

const configurationValues = (
  configuration: NonNullable<CatalogSelection['configuration']>,
  tenantId: string,
): CurrentConfigurationValue[] | undefined => {
  const values: CurrentConfigurationValue[] = [];
  for (const choice of configuration.choices) {
    if (choice.unit === undefined) {
      values.push({ choiceKey: choice.choiceKey, kind: 'SINGLE_CHOICE', optionKey: choice.value });
      continue;
    }
    if (
      choice.unit.resourceRef.tenantId !== tenantId ||
      choice.unit.resourceRef.resourceType !== 'commerce.catalog.unit'
    ) {
      return undefined;
    }
    values.push({
      amount: choice.value,
      choiceKey: choice.choiceKey,
      kind: 'MEASURED_VALUE',
      unitId: choice.unit.resourceRef.resourceId,
    });
  }
  return values;
};

const assessConfiguration = Effect.fn('CatalogSelectionDependentBasis.configuration')(function* assessConfiguration(
  transaction: ScopedTransaction,
  scope: OperationalScope,
  selection: CatalogSelection,
  at: Date,
) {
  const { configuration } = selection;
  if (configuration === undefined) {
    return valid;
  }
  const { definition } = configuration;
  if (
    definition.revisionId !== undefined ||
    definition.resourceRef.tenantId !== scope.tenantId ||
    definition.resourceRef.moduleId !== catalogModuleId ||
    configuration.productRef.resourceId !== selection.productRef.resourceId ||
    configuration.variantRef.resourceId !== selection.variantRef.resourceId
  ) {
    return unknown('Configuration target cannot be verified');
  }
  const values = configurationValues(configuration, scope.tenantId);
  if (values === undefined) {
    return unknown('Configuration Unit owner cannot be verified');
  }
  const current = yield* productConfigurationPersistenceForScope(transaction, scope).readCurrent({
    at,
    definitionId: definition.resourceRef.resourceId,
    productId: selection.productRef.resourceId,
  });
  if (Option.isNone(current)) {
    return unknown('Configuration Current revision is missing');
  }
  if (current.value.revision !== definition.revision) {
    return invalid('Selected Configuration revision is not Current');
  }
  const target: TrustedConfigurationTarget = {
    definitionId: definition.resourceRef.resourceId,
    productId: selection.productRef.resourceId,
    variantId: selection.variantRef.resourceId,
  };
  const assessment = yield* evaluateCurrentProductConfiguration(
    { readCurrent: () => Effect.succeed(current) },
    {
      at,
      target:
        selection.packageOption === undefined
          ? target
          : { ...target, packageDefinitionId: selection.packageOption.optionRef.resourceId },
      values,
    },
  );
  if (assessment.status !== 'VALID') {
    return assessment.status === 'INVALID' ? invalid(assessment.code) : unknown(assessment.code);
  }
  // Rule evaluation does not prove Attribute Definition or Unit revision ownership.
  return configuration.choices.length > 0
    ? unknown('Configuration choice revision ownership is not yet attested')
    : valid;
});

const assessSet = Effect.fn('CatalogSelectionDependentBasis.set')(function* assessSet(
  transaction: ScopedTransaction,
  scope: OperationalScope,
  selection: CatalogSelection,
  at: Date,
  componentProofs?: SetComponentProofSource,
) {
  const { setComposition: selected } = selection;
  if (selected === undefined) {
    return valid;
  }
  if (
    selected.revisionId !== undefined ||
    selected.resourceRef.tenantId !== scope.tenantId ||
    selected.resourceRef.moduleId !== catalogModuleId
  ) {
    return unknown('Set Composition owner cannot be verified');
  }
  const current = yield* setCompositionPersistenceForScope(transaction, scope).readCurrent({
    at,
    compositionId: selected.resourceRef.resourceId,
  });
  if (Option.isNone(current)) {
    return unknown('Set Composition Current revision is missing');
  }
  const { revision } = current.value;
  if (
    revision.reference.revision !== selected.revision ||
    revision.productRef.resourceId !== selection.productRef.resourceId ||
    revision.variantRef.resourceId !== selection.variantRef.resourceId ||
    current.value.lifecycleState !== 'ACTIVE'
  ) {
    return invalid('Selected Set Composition is not Current for the exact target');
  }
  if (componentProofs === undefined) {
    return unknown('Current Set component proofs are unavailable');
  }
  const proofs = yield* Effect.forEach(
    revision.components,
    (component) => componentProofs.read({ at, componentId: component.componentId, selection: component.selection }),
    { concurrency: 1 },
  );
  if (proofs.some(Option.isNone)) {
    return unknown('Current Set component proof is missing');
  }
  const result = validateSetComponents(
    revision,
    proofs.map((proof) => Option.getOrThrow(proof)),
  );
  if (result.status === 'VALID') {
    return valid;
  }
  return result.status === 'INVALID' ? invalid(result.code) : unknown(result.code);
});

/** Current revision checks are exact; historical references never substitute for Current. */
export const catalogSelectionDependentBasisForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  componentProofs?: SetComponentProofSource,
) => ({
  assess: Effect.fn('CatalogSelectionDependentBasis.assess')(function* assess(input: {
    readonly at: Date;
    readonly selection: CatalogSelection;
  }) {
    const { at, selection } = input;
    if (
      selection.productRef.tenantId !== scope.tenantId ||
      selection.variantRef.tenantId !== scope.tenantId ||
      selection.productRef.moduleId !== catalogModuleId ||
      selection.variantRef.moduleId !== catalogModuleId
    ) {
      return unknown('Selection owner or Tenant cannot be verified');
    }
    const configuration = yield* assessConfiguration(transaction, scope, selection, at);
    return configuration.status === 'VALID'
      ? yield* assessSet(transaction, scope, selection, at, componentProofs)
      : configuration;
  }),
});
