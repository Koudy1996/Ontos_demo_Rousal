import type { OperationalScope, ReadServiceFactory } from '@app/core-runtime';
import { Effect, Option } from 'effect';

import type {
  CartOpenSelectionPopulationPort,
  CartOpenSelectionReference,
} from '../../shared/domain/catalog-open-selection-population.ts';
import type { CatalogSelection } from '../../shared/domain/catalog-selection-evidence.ts';
import type {
  ProductConfiguration,
  ProductConfigurationDefinitionRevision,
} from '../../shared/domain/product-configuration.ts';
import type { CatalogSelectionEvidenceAssessor } from './catalog-selection-open-population.ts';
import {
  assessCatalogOpenSelectionSnapshot,
  catalogSelectionOpenPopulationImpactForScope,
} from './catalog-selection-open-population.ts';
import { catalogSelectionEvidenceForScope } from './catalog-selection-evidence-service.ts';
import type { PackageActivationSelectionImpact } from './package-activation-persistence.ts';
import { PackageActivationUnavailable } from './package-activation-persistence.ts';
import type {
  CurrentConfigurationAssessmentInput,
  CurrentConfigurationValue,
  TrustedConfigurationTarget,
} from './product-configuration-current-evaluator.ts';
import { evaluateCurrentProductConfiguration } from './product-configuration-current-evaluator.ts';
import type {
  ConfigurationSelectionImpact,
  CurrentConfigurationRevision,
} from './product-configuration-persistence.ts';
import {
  ProductConfigurationPersistenceUnavailable,
  productConfigurationPersistenceForScope,
} from './product-configuration-persistence.ts';
import type { SetCompositionSelectionImpact } from './set-composition-persistence.ts';
import { SetCompositionPersistenceUnavailable } from './set-composition-persistence.ts';
import type { ProductConfigurationAssessmentSide } from '../domain/product-configuration-reassessment.ts';
import { reassessProductConfigurationChange } from '../domain/product-configuration-reassessment.ts';

type ScopedTransaction = Parameters<ReadServiceFactory<Readonly<Record<string, never>>>>[0];

const configurationUnavailable = (reason: string) =>
  new ProductConfigurationPersistenceUnavailable({
    code: 'product_configuration_persistence_unavailable',
    reason,
  });

const configurationTarget = (selection: CatalogSelection): TrustedConfigurationTarget | undefined => {
  const { configuration } = selection;
  if (configuration === undefined) {
    return undefined;
  }
  const base: TrustedConfigurationTarget = {
    definitionId: configuration.definition.resourceRef.resourceId,
    productId: selection.productRef.resourceId,
    variantId: selection.variantRef.resourceId,
  };
  return selection.packageOption === undefined
    ? base
    : { ...base, packageDefinitionId: selection.packageOption.optionRef.resourceId };
};

const configurationValues = (selection: CatalogSelection): readonly CurrentConfigurationValue[] =>
  (selection.configuration?.choices ?? []).map((choice) =>
    choice.unit === undefined
      ? { choiceKey: choice.choiceKey, kind: 'SINGLE_CHOICE' as const, optionKey: choice.value }
      : {
          amount: choice.value,
          choiceKey: choice.choiceKey,
          kind: 'MEASURED_VALUE' as const,
          unitId: choice.unit.resourceRef.resourceId,
        },
  );

const productConfigurationFromSelection = (selection: CatalogSelection): ProductConfiguration | undefined => {
  const { configuration } = selection;
  if (configuration === undefined) {
    return undefined;
  }
  const base: ProductConfiguration = {
    definition: configuration.definition,
    productRef: configuration.productRef,
    values: configuration.choices.map((choice) =>
      choice.unit === undefined
        ? { choiceKey: choice.choiceKey, kind: 'SINGLE_CHOICE' as const, optionKey: choice.value }
        : {
            amount: choice.value,
            choiceKey: choice.choiceKey,
            kind: 'MEASURED_VALUE' as const,
            unitRef: choice.unit.resourceRef,
          },
    ),
    variantRef: configuration.variantRef,
  };
  return selection.packageOption === undefined
    ? base
    : { ...base, packageOptionRef: selection.packageOption.optionRef };
};

const definitionFromCurrent = (
  revision: CurrentConfigurationRevision,
  selection: CatalogSelection,
): ProductConfigurationDefinitionRevision | undefined => {
  const { configuration } = selection;
  if (configuration === undefined) {
    return undefined;
  }
  const units = new Map(revision.units.map((unit) => [unit.ref.resourceId, unit.ref]));
  const choices: ProductConfigurationDefinitionRevision['choices'][number][] = [];
  for (const choice of revision.choices) {
    if (choice.kind === 'SINGLE_CHOICE') {
      choices.push({
        choiceKey: choice.choiceKey,
        kind: 'SINGLE_CHOICE',
        meaning: choice.meaning,
        options: choice.options ?? [],
        required: choice.required,
      });
      continue;
    }
    const unitRef = units.get(choice.unitId ?? '');
    if (unitRef === undefined) {
      return undefined;
    }
    choices.push({
      choiceKey: choice.choiceKey,
      kind: 'MEASURED_VALUE',
      meaning: choice.meaning,
      required: choice.required,
      unitRef,
    });
  }
  return { choices, productRef: selection.productRef, reference: configuration.definition };
};

const reassessOpenConfiguration = Effect.fn('CatalogSelectionChangeImpact.reassessOpenConfiguration')(
  function* reassessOpenConfigurationStep(
    transaction: ScopedTransaction,
    scope: OperationalScope,
    revisionToken: string,
    input: Parameters<ConfigurationSelectionImpact['verify']>[0],
    reference: CartOpenSelectionReference,
  ): Effect.fn.Return<boolean> {
    const { selection } = reference;
    const configuration = productConfigurationFromSelection(selection);
    const target = configurationTarget(selection);
    if (configuration === undefined || target === undefined) {
      return true;
    }
    const persistence = productConfigurationPersistenceForScope(transaction, scope);
    const at = input.effectiveFrom;
    const sideInput: CurrentConfigurationAssessmentInput = { at, target, values: configurationValues(selection) };
    const [assessment, current] = yield* Effect.all(
      [
        evaluateCurrentProductConfiguration(persistence, sideInput).pipe(Effect.option),
        persistence
          .readCurrent({ at, definitionId: input.definitionId, productId: input.productId })
          .pipe(Effect.orElseSucceed(() => Option.none())),
      ] as const,
      { concurrency: 1 },
    );
    if (Option.isNone(assessment) || assessment.value.status !== 'VALID' || Option.isNone(current)) {
      return true;
    }
    const definition = definitionFromCurrent(current.value, selection);
    if (definition === undefined) {
      return true;
    }
    const side: ProductConfigurationAssessmentSide = { assessment: assessment.value, definition, input: sideInput };
    const result = reassessProductConfigurationChange({
      authority: { complete: true, observedAt: at, revisionToken, selectionId: reference.selectionId },
      current: side,
      earlier: side,
      selection: configuration,
    });
    return result.status !== 'INVALIDATED';
  },
);

const configurationAffected =
  (input: Parameters<ConfigurationSelectionImpact['verify']>[0]) =>
  (reference: CartOpenSelectionReference): boolean =>
    reference.selection.configuration !== undefined &&
    reference.selection.configuration.definition.resourceRef.resourceId === input.definitionId &&
    reference.selection.productRef.resourceId === input.productId;

/** #479-backed impact for a Configuration Definition publication. */
export const productConfigurationSelectionImpactForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  population?: CartOpenSelectionPopulationPort,
  assess?: CatalogSelectionEvidenceAssessor,
): ConfigurationSelectionImpact => ({
  verify: Effect.fn('ProductConfigurationSelectionImpact.verify')(function* verifyConfigurationImpact(
    input: Parameters<ConfigurationSelectionImpact['verify']>[0],
  ) {
    if (population === undefined) {
      return yield* configurationUnavailable('Owner-confirmed Cart/checkout open-selection population is unavailable');
    }
    const snapshot = yield* population.read.pipe(
      Effect.mapError((failure) => configurationUnavailable(failure.reason)),
    );
    const affected = snapshot.selections.filter(configurationAffected(input));
    const impacted = yield* assessCatalogOpenSelectionSnapshot({
      affected: configurationAffected(input),
      assess: assess ?? ((request) => catalogSelectionEvidenceForScope(transaction, scope).assess(request)),
      purpose: 'PURCHASE_ACCEPTANCE',
      snapshot,
    });
    if (impacted.kind !== 'PROVEN') {
      return false;
    }
    const reassessments = yield* Effect.forEach(
      affected,
      (reference) => reassessOpenConfiguration(transaction, scope, snapshot.revisionToken, input, reference),
      { concurrency: 1 },
    );
    return reassessments.every(Boolean);
  }),
});

/** #479-backed impact for Package Definition activation. */
export const packageActivationSelectionImpactForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  population?: CartOpenSelectionPopulationPort,
  assess?: CatalogSelectionEvidenceAssessor,
): PackageActivationSelectionImpact => ({
  verify: Effect.fn('PackageActivationSelectionImpact.verify')(function* verifyPackageActivationImpact(
    input: Parameters<PackageActivationSelectionImpact['verify']>[0],
  ) {
    const impacted = yield* catalogSelectionOpenPopulationImpactForScope(transaction, scope, population, assess)
      .assess({
        affected: (reference) => reference.selection.packageOption?.optionRef.resourceId === input.packageDefinitionId,
        purpose: 'PURCHASE_ACCEPTANCE',
      })
      .pipe(
        Effect.mapError(
          (failure) =>
            new PackageActivationUnavailable({
              code: 'package_activation_unavailable',
              reason: failure.reason,
            }),
        ),
      );
    if (impacted.kind === 'POPULATION_UNAVAILABLE') {
      return yield* new PackageActivationUnavailable({
        code: 'package_activation_unavailable',
        reason: impacted.reason,
      });
    }
    return impacted.kind === 'PROVEN';
  }),
});

/** #479-backed impact for an original-data-error Set Composition correction. */
export const setCompositionSelectionImpactForScope = (
  transaction: ScopedTransaction,
  scope: OperationalScope,
  population?: CartOpenSelectionPopulationPort,
  assess?: CatalogSelectionEvidenceAssessor,
): SetCompositionSelectionImpact => ({
  verify: Effect.fn('SetCompositionSelectionImpact.verify')(function* verifySetCorrectionImpact(
    input: Parameters<SetCompositionSelectionImpact['verify']>[0],
  ) {
    const impacted = yield* catalogSelectionOpenPopulationImpactForScope(transaction, scope, population, assess)
      .assess({
        affected: (reference) => reference.selection.setComposition?.resourceRef.resourceId === input.compositionId,
        purpose: 'PURCHASE_ACCEPTANCE',
      })
      .pipe(
        Effect.mapError(
          (failure) =>
            new SetCompositionPersistenceUnavailable({
              code: 'set_composition_persistence_unavailable',
              reason: failure.reason,
            }),
        ),
      );
    if (impacted.kind === 'POPULATION_UNAVAILABLE') {
      return yield* new SetCompositionPersistenceUnavailable({
        code: 'set_composition_persistence_unavailable',
        reason: impacted.reason,
      });
    }
    return impacted.kind === 'PROVEN';
  }),
});
