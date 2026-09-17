import type { CatalogResourceRef } from './catalog-revision-reference.ts';
import { sameCatalogRevisionReference } from './catalog-revision-reference.ts';
import type { CatalogSelectionRevision } from './catalog-selection-evidence.ts';
import type { ProductRef } from '../resources/product.ts';
import type { VariantRef } from '../resources/variant.ts';

/** Stable keys are issued by Catalog; labels and presentation order are not identity. */
export interface ConfigurationSingleChoiceDefinition {
  readonly choiceKey: string;
  readonly kind: 'SINGLE_CHOICE';
  readonly meaning: string;
  readonly options: readonly { readonly label: string; readonly meaning: string; readonly optionKey: string }[];
  readonly required: boolean;
}

export interface ConfigurationMeasuredValueDefinition {
  readonly choiceKey: string;
  readonly kind: 'MEASURED_VALUE';
  readonly meaning: string;
  readonly required: boolean;
  readonly unitRef: CatalogResourceRef;
}

export type ConfigurationChoiceDefinition = ConfigurationSingleChoiceDefinition | ConfigurationMeasuredValueDefinition;

/** This is an owner-qualified, exact revision of a Product-level Resource. */
export interface ProductConfigurationDefinitionRevision {
  readonly choices: readonly ConfigurationChoiceDefinition[];
  readonly productRef: ProductRef;
  readonly reference: CatalogSelectionRevision;
}

export interface ConfigurationSingleChoiceValue {
  readonly choiceKey: string;
  readonly kind: 'SINGLE_CHOICE';
  readonly optionKey: string;
}

export interface ConfigurationMeasuredValue {
  readonly amount: string;
  readonly choiceKey: string;
  readonly kind: 'MEASURED_VALUE';
  readonly unitRef: CatalogResourceRef;
}

export type ConfigurationChosenValue = ConfigurationSingleChoiceValue | ConfigurationMeasuredValue;

/** A configuration is a value at an exact Catalog target, never a new Variant or SKU. */
export interface ProductConfiguration {
  readonly definition: CatalogSelectionRevision;
  readonly packageOptionRef?: CatalogResourceRef;
  readonly productRef: ProductRef;
  readonly values: readonly ConfigurationChosenValue[];
  readonly variantRef: VariantRef;
}

export type ConfigurationInspection =
  | { readonly status: 'VALID' }
  | { readonly reason: string; readonly status: 'INVALID' }
  | { readonly reason: string; readonly status: 'INDETERMINATE' };

const sameRef = (left: CatalogResourceRef, right: CatalogResourceRef): boolean =>
  left.moduleId === right.moduleId &&
  left.resourceType === right.resourceType &&
  left.tenantId === right.tenantId &&
  left.resourceId === right.resourceId;

const isKey = (key: string): boolean => key.length > 0 && key === key.trim();
const decimalPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u;

/** Normalize only an exact decimal's spelling; no rounding or Unit conversion occurs. */
const canonicalDecimal = (amount: string): string | null => {
  if (!decimalPattern.test(amount)) {
    return null;
  }
  const [whole = '', fraction = ''] = amount.split('.');
  const trimmed = fraction.replace(/0+$/u, '');
  const normalizedWhole = whole === '-0' ? '0' : whole;
  return normalizedWhole + (trimmed.length === 0 ? '' : `.${trimmed}`);
};

/** Definition structure must be sound before any selection can be called complete. */
export const inspectConfigurationDefinition = (
  definition: ProductConfigurationDefinitionRevision,
): ConfigurationInspection => {
  if (definition.reference.resourceRef.resourceType !== 'commerce.catalog.configuration-definition') {
    return { reason: 'Expected a Configuration Definition revision', status: 'INVALID' };
  }
  if (definition.productRef.tenantId !== definition.reference.resourceRef.tenantId) {
    return { reason: 'Definition and Product must share a Tenant', status: 'INVALID' };
  }
  const keys = new Set<string>();
  for (const choice of definition.choices) {
    if (!isKey(choice.choiceKey) || !isKey(choice.meaning) || keys.has(choice.choiceKey)) {
      return { reason: 'Choice keys and meanings must be nonempty and choice keys unique', status: 'INVALID' };
    }
    keys.add(choice.choiceKey);
    if (choice.kind === 'SINGLE_CHOICE') {
      const optionKeys = new Set<string>();
      if (choice.options.length === 0) {
        return { reason: 'Single Choice needs explicit options', status: 'INVALID' };
      }
      for (const option of choice.options) {
        if (!isKey(option.optionKey) || !isKey(option.meaning) || optionKeys.has(option.optionKey)) {
          return { reason: 'Option keys and meanings must be nonempty and option keys unique', status: 'INVALID' };
        }
        optionKeys.add(option.optionKey);
      }
    } else if (choice.unitRef.tenantId !== definition.productRef.tenantId) {
      return { reason: 'Measured Unit must share the Product Tenant', status: 'INVALID' };
    }
  }
  return { status: 'VALID' };
};

/** Structural completeness only. Constraint and compatibility rules are assessed separately. */
export const inspectProductConfiguration = (
  selection: ProductConfiguration,
  definition: ProductConfigurationDefinitionRevision | undefined,
): ConfigurationInspection => {
  if (
    selection.productRef.tenantId !== selection.variantRef.tenantId ||
    (selection.packageOptionRef !== undefined && selection.packageOptionRef.tenantId !== selection.productRef.tenantId)
  ) {
    return { reason: 'Exact target references must share a Tenant', status: 'INVALID' };
  }
  if (definition === undefined) {
    return { reason: 'Definition revision is unavailable', status: 'INDETERMINATE' };
  }
  if (!sameCatalogRevisionReference(selection.definition, definition.reference)) {
    return { reason: 'Exact Definition revision is unavailable', status: 'INDETERMINATE' };
  }
  if (!sameRef(selection.productRef, definition.productRef)) {
    return { reason: 'Configuration belongs to a different Product', status: 'INVALID' };
  }
  const definitionStatus = inspectConfigurationDefinition(definition);
  if (definitionStatus.status !== 'VALID') {
    return definitionStatus;
  }
  const choices = new Map(definition.choices.map((choice) => [choice.choiceKey, choice]));
  const seen = new Set<string>();
  for (const value of selection.values) {
    if (seen.has(value.choiceKey)) {
      return { reason: 'Duplicate chosen choice', status: 'INVALID' };
    }
    seen.add(value.choiceKey);
    const choice = choices.get(value.choiceKey);
    if (choice === undefined) {
      return { reason: 'Unknown chosen choice', status: 'INVALID' };
    }
    if (choice.kind !== value.kind) {
      return { reason: 'Chosen value has the wrong kind', status: 'INVALID' };
    }
    if (choice.kind === 'SINGLE_CHOICE' && value.kind === 'SINGLE_CHOICE') {
      if (!choice.options.some((option) => option.optionKey === value.optionKey)) {
        return { reason: 'Unknown Single Choice option', status: 'INVALID' };
      }
    } else if (choice.kind === 'MEASURED_VALUE' && value.kind === 'MEASURED_VALUE') {
      if (!sameRef(choice.unitRef, value.unitRef)) {
        return { reason: 'Unit conversion needs explicit equivalence evidence', status: 'INDETERMINATE' };
      }
      if (canonicalDecimal(value.amount) === null) {
        return { reason: 'Measured Value must be an exact decimal', status: 'INVALID' };
      }
    }
  }
  if (definition.choices.some((choice) => choice.required && !seen.has(choice.choiceKey))) {
    return { reason: 'Required choice is missing', status: 'INVALID' };
  }
  return { status: 'VALID' };
};

/** Compare business values after both are verified against their exact definitions. */
export const sameProductConfigurationSelection = (
  left: ProductConfiguration,
  right: ProductConfiguration,
  definition: ProductConfigurationDefinitionRevision | undefined,
): ConfigurationInspection & { readonly same?: boolean } => {
  const leftInspection = inspectProductConfiguration(left, definition);
  if (leftInspection.status !== 'VALID') {
    return leftInspection;
  }
  const rightInspection = inspectProductConfiguration(right, definition);
  if (rightInspection.status !== 'VALID') {
    return rightInspection;
  }
  if (
    !sameRef(left.productRef, right.productRef) ||
    !sameRef(left.variantRef, right.variantRef) ||
    (left.packageOptionRef === undefined) !== (right.packageOptionRef === undefined) ||
    (left.packageOptionRef !== undefined &&
      right.packageOptionRef !== undefined &&
      !sameRef(left.packageOptionRef, right.packageOptionRef))
  ) {
    return { same: false, status: 'VALID' };
  }
  const rightValues = new Map(right.values.map((value) => [value.choiceKey, value]));
  for (const value of left.values) {
    const other = rightValues.get(value.choiceKey);
    if (other === undefined || value.kind !== other.kind) {
      return { same: false, status: 'VALID' };
    }
    if (value.kind === 'SINGLE_CHOICE' && other.kind === 'SINGLE_CHOICE' && value.optionKey !== other.optionKey) {
      return { same: false, status: 'VALID' };
    }
    if (
      value.kind === 'MEASURED_VALUE' &&
      other.kind === 'MEASURED_VALUE' &&
      (!sameRef(value.unitRef, other.unitRef) || canonicalDecimal(value.amount) !== canonicalDecimal(other.amount))
    ) {
      return { same: false, status: 'VALID' };
    }
  }
  return { same: left.values.length === right.values.length, status: 'VALID' };
};
