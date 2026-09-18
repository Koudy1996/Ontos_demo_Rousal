import { sameProductConfigurationSelectionAcrossRevisions } from '../../shared/domain/product-configuration.ts';
import type {
  ConfigurationInspection,
  ProductConfiguration,
  ProductConfigurationDefinitionRevision,
  ProductConfigurationRevisionEquivalenceAttestation,
} from '../../shared/domain/product-configuration.ts';
import type {
  CurrentConfigurationAssessment,
  CurrentConfigurationAssessmentInput,
} from '../persistence/product-configuration-current-evaluator.ts';

const assessmentMatchesSelection = (
  assessment: CurrentConfigurationAssessment,
  input: CurrentConfigurationAssessmentInput,
  selection: ProductConfiguration,
): boolean => {
  if (
    assessment.definitionId !== selection.definition.resourceRef.resourceId ||
    assessment.definitionRevision !== selection.definition.revision ||
    assessment.target.definitionId !== assessment.definitionId ||
    assessment.target.productId !== selection.productRef.resourceId ||
    assessment.target.variantId !== selection.variantRef.resourceId ||
    assessment.target.packageDefinitionId !== selection.packageOptionRef?.resourceId ||
    assessment.target.packageDefinitionId !== input.target.packageDefinitionId ||
    assessment.assessedAt.getTime() !== input.at.getTime() ||
    input.target.definitionId !== assessment.target.definitionId ||
    input.target.productId !== assessment.target.productId ||
    input.target.variantId !== assessment.target.variantId ||
    input.values.length !== selection.values.length
  ) {
    return false;
  }
  const assessed = new Map(input.values.map((value) => [value.choiceKey, value]));
  if (assessed.size !== input.values.length) {
    return false;
  }
  return selection.values.every((value) => {
    const other = assessed.get(value.choiceKey);
    return (
      other !== undefined &&
      value.kind === other.kind &&
      (value.kind === 'SINGLE_CHOICE' && other.kind === 'SINGLE_CHOICE'
        ? value.optionKey === other.optionKey
        : value.kind === 'MEASURED_VALUE' &&
          other.kind === 'MEASURED_VALUE' &&
          value.amount === other.amount &&
          value.unitRef.resourceId === other.unitId)
    );
  });
};

const sameRuleBasis = (
  attested: ProductConfigurationRevisionEquivalenceAttestation['admissibility']['leftRuleRevisions'],
  assessment: CurrentConfigurationAssessment,
): boolean => {
  const attestedIds = new Set(attested.map((rule) => rule.ruleId));
  const assessedIds = new Set(assessment.rules.map((rule) => rule.ruleId));
  return (
    attested.length === assessment.rules.length &&
    attestedIds.size === attested.length &&
    assessedIds.size === assessment.rules.length &&
    attested.every((rule) =>
      assessment.rules.some((assessed) => assessed.ruleId === rule.ruleId && assessed.revision === rule.revision),
    )
  );
};

/**
 * Owner-private consumption gate. The attestation must come from a trusted Catalog
 * reader; this function cannot authenticate or issue one from caller-supplied data.
 */
export const assessProductConfigurationEquivalence = (
  left: ProductConfiguration,
  leftDefinition: ProductConfigurationDefinitionRevision | undefined,
  leftInput: CurrentConfigurationAssessmentInput,
  leftAssessment: CurrentConfigurationAssessment | undefined,
  right: ProductConfiguration,
  rightDefinition: ProductConfigurationDefinitionRevision | undefined,
  rightInput: CurrentConfigurationAssessmentInput,
  rightAssessment: CurrentConfigurationAssessment | undefined,
  attestation: ProductConfigurationRevisionEquivalenceAttestation | undefined,
): ConfigurationInspection & { readonly same?: boolean } => {
  const structural = sameProductConfigurationSelectionAcrossRevisions(
    left,
    leftDefinition,
    right,
    rightDefinition,
    attestation,
  );
  if (structural.status !== 'VALID' || structural.same !== true) {
    return structural;
  }
  if (
    leftAssessment?.status !== 'VALID' ||
    rightAssessment?.status !== 'VALID' ||
    !assessmentMatchesSelection(leftAssessment, leftInput, left) ||
    !assessmentMatchesSelection(rightAssessment, rightInput, right)
  ) {
    return { reason: 'Exact owner admissibility assessments are unavailable', status: 'INDETERMINATE' };
  }
  if (
    attestation !== undefined &&
    (!sameRuleBasis(attestation.admissibility.leftRuleRevisions, leftAssessment) ||
      !sameRuleBasis(attestation.admissibility.rightRuleRevisions, rightAssessment))
  ) {
    return { reason: 'Owner equivalence proof does not match assessed rule bases', status: 'INDETERMINATE' };
  }
  return structural;
};
