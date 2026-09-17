import { Schema } from 'effect';

import { CatalogResourceRefSchema } from './catalog-revision-reference.ts';

const AttributeDefinitionRefSchema = CatalogResourceRefSchema.check(
  Schema.makeFilter((ref) =>
    ref.resourceType === 'commerce.catalog.attribute-definition' ? undefined : 'Expected an Attribute Definition',
  ),
);
const ControlledValueRefSchema = CatalogResourceRefSchema.check(
  Schema.makeFilter((ref) =>
    ref.resourceType === 'commerce.catalog.controlled-attribute-value' ? undefined : 'Expected a controlled value',
  ),
);
const finiteNumber = Schema.Number.check(Schema.isFinite());

/** A shared definition asks one stable question; its label is not its identity. */
export const AttributeDefinitionSchema = Schema.Struct({
  ref: AttributeDefinitionRefSchema,
  label: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  meaning: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  levels: Schema.Array(Schema.Literals(['PRODUCT', 'VARIANT'])),
  multiplicity: Schema.Literals(['SINGLE', 'MULTIPLE']),
  valueKind: Schema.Literals(['TEXT', 'CONTROLLED', 'MEASUREMENT']),
  specialStates: Schema.Array(Schema.Literals(['UNKNOWN', 'NONE', 'NOT_APPLICABLE'])),
  measurement: Schema.optionalKey(
    Schema.Struct({
      quantity: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
      canonicalUnit: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
      minimum: Schema.optionalKey(finiteNumber),
      maximum: Schema.optionalKey(finiteNumber),
      decimalPlaces: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 0, maximum: 12 })),
    }),
  ),
}).check(
  Schema.makeFilter((definition) => {
    if (definition.levels.length === 0 || new Set(definition.levels).size !== definition.levels.length) {
      return 'A definition needs distinct applicable levels';
    }
    if ((definition.valueKind === 'MEASUREMENT') !== (definition.measurement !== undefined)) {
      return 'Only measured definitions have measurement rules';
    }
    if (
      definition.measurement !== undefined &&
      definition.measurement.minimum !== undefined &&
      definition.measurement.maximum !== undefined &&
      definition.measurement.minimum > definition.measurement.maximum
    ) {
      return 'Measurement minimum cannot exceed maximum';
    }
    return new Set(definition.specialStates).size === definition.specialStates.length
      ? undefined
      : 'Special states cannot repeat';
  }),
);
export type AttributeDefinition = typeof AttributeDefinitionSchema.Type;

/** Absence is represented by no values, never by a fabricated zero, blank, or special state. */
export const AttributeValueSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('TEXT'), text: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()) }),
  Schema.Struct({ kind: Schema.Literal('CONTROLLED'), valueRef: ControlledValueRefSchema }),
  Schema.Struct({
    kind: Schema.Literal('MEASUREMENT'),
    amount: finiteNumber,
    unit: Schema.String.check(Schema.isNonEmpty(), Schema.isTrimmed()),
  }),
  Schema.Struct({ kind: Schema.Literal('SPECIAL'), state: Schema.Literals(['UNKNOWN', 'NONE', 'NOT_APPLICABLE']) }),
]);
export type AttributeValue = typeof AttributeValueSchema.Type;

/** A proposed conversion; only owner-known exact relationships can authorize it. */
export interface UnitConversion {
  readonly from: string;
  readonly to: string;
  readonly quantity: string;
  readonly numerator: number;
  readonly denominator: number;
}

// Catalog-owned exact relationships. Request payloads cannot establish unit semantics.
const trustedConversions: readonly UnitConversion[] = [
  { denominator: 1, from: 'cm', numerator: 10, quantity: 'length', to: 'mm' },
  { denominator: 10, from: 'mm', numerator: 1, quantity: 'length', to: 'cm' },
];

interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** Number.toString preserves the entered decimal value, including exponent notation. */
const decimalRatio = (value: number): Rational => {
  const [mantissa = '', exponentText = '0'] = value.toString().toLowerCase().split('e');
  const negative = mantissa.startsWith('-');
  const digits = mantissa.replace('-', '').replace('.', '');
  const fractionalDigits = mantissa.includes('.') ? mantissa.length - mantissa.indexOf('.') - 1 : 0;
  const exponent = Number(exponentText) - fractionalDigits;
  const signed = BigInt(digits) * (negative ? -1n : 1n);
  return exponent >= 0
    ? { numerator: signed * 10n ** BigInt(exponent), denominator: 1n }
    : { numerator: signed, denominator: 10n ** BigInt(-exponent) };
};

const compareRatios = (left: Rational, right: Rational): number => {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

/** Pure per-subject validation; Product Type owns required/optional and applicability. */
export const validateAttributeValues = (
  definition: AttributeDefinition,
  values: readonly AttributeValue[],
  conversions: readonly UnitConversion[] = [],
): { readonly valid: boolean; readonly normalized: readonly AttributeValue[]; readonly reasons: readonly string[] } => {
  const reasons: string[] = [];
  const normalized: AttributeValue[] = [];
  if (!Schema.is(AttributeDefinitionSchema)(definition)) {
    return { valid: false, normalized, reasons: ['Invalid definition'] };
  }
  if (definition.multiplicity === 'SINGLE' && values.length > 1) reasons.push('Single attribute has multiple values');
  if (values.some((value) => value.kind === 'SPECIAL') && values.length > 1) {
    reasons.push('A special state cannot coexist with another value');
  }
  for (const value of values) {
    if (!Schema.is(AttributeValueSchema)(value)) {
      reasons.push('Malformed value');
      continue;
    }
    if (value.kind === 'SPECIAL') {
      if (!definition.specialStates.includes(value.state)) reasons.push('Special state is not allowed');
      normalized.push(value);
      continue;
    }
    if (value.kind !== definition.valueKind) {
      reasons.push('Value kind differs from definition');
      continue;
    }
    if (value.kind === 'CONTROLLED') {
      if (value.valueRef.tenantId !== definition.ref.tenantId)
        reasons.push('Controlled value belongs to another Tenant');
      normalized.push(value);
      continue;
    }
    if (value.kind === 'TEXT') {
      normalized.push(value);
      continue;
    }
    const rule = definition.measurement;
    if (rule === undefined) {
      reasons.push('Measurement rules are missing');
      continue;
    }
    const conversion =
      value.unit === rule.canonicalUnit
        ? undefined
        : conversions.find(
            (item) => item.from === value.unit && item.to === rule.canonicalUnit && item.quantity === rule.quantity,
          );
    if (value.unit !== rule.canonicalUnit && conversion === undefined) {
      reasons.push('No evidenced compatible unit conversion');
      continue;
    }
    if (
      conversion !== undefined &&
      (!Number.isFinite(conversion.numerator) ||
        !Number.isFinite(conversion.denominator) ||
        conversion.numerator <= 0 ||
        conversion.denominator <= 0)
    ) {
      reasons.push('Invalid unit conversion');
      continue;
    }
    if (conversion !== undefined) {
      const trusted = trustedConversions.find(
        (item) => item.from === conversion.from && item.to === conversion.to && item.quantity === conversion.quantity,
      );
      if (
        trusted === undefined ||
        compareRatios(
          {
            denominator:
              decimalRatio(conversion.numerator).denominator * decimalRatio(conversion.denominator).numerator,
            numerator: decimalRatio(conversion.numerator).numerator * decimalRatio(conversion.denominator).denominator,
          },
          { denominator: BigInt(trusted.denominator), numerator: BigInt(trusted.numerator) },
        ) !== 0
      ) {
        reasons.push('No evidenced compatible unit conversion');
        continue;
      }
    }
    const source = decimalRatio(value.amount);
    const numerator =
      conversion === undefined ? { numerator: 1n, denominator: 1n } : decimalRatio(conversion.numerator);
    const denominator =
      conversion === undefined ? { numerator: 1n, denominator: 1n } : decimalRatio(conversion.denominator);
    const amount = {
      numerator: source.numerator * numerator.numerator * denominator.denominator,
      denominator: source.denominator * numerator.denominator * denominator.numerator,
    };
    if (
      (rule.minimum !== undefined && compareRatios(amount, decimalRatio(rule.minimum)) < 0) ||
      (rule.maximum !== undefined && compareRatios(amount, decimalRatio(rule.maximum)) > 0)
    ) {
      reasons.push('Measurement is outside its valid range');
      continue;
    }
    const scaled = amount.numerator * 10n ** BigInt(rule.decimalPlaces);
    if (scaled % amount.denominator !== 0n) {
      reasons.push('Measurement loses required precision');
      continue;
    }
    const scaledInteger = scaled / amount.denominator;
    if (scaledInteger > BigInt(Number.MAX_SAFE_INTEGER) || scaledInteger < BigInt(Number.MIN_SAFE_INTEGER)) {
      reasons.push('Measurement exceeds exact numeric precision');
      continue;
    }
    const canonicalAmount = Number(scaledInteger) / 10 ** rule.decimalPlaces;
    normalized.push({ kind: 'MEASUREMENT', amount: canonicalAmount, unit: rule.canonicalUnit });
  }
  return { valid: reasons.length === 0, normalized, reasons };
};
