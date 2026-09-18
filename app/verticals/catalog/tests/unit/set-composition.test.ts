import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import { CatalogResourceRefSchema } from '../../shared/domain/catalog-revision-reference.ts';
import {
  classifySetCompositionChange,
  SetCompositionRevisionSchema,
  summarizeSetComponents,
} from '../../shared/domain/set-composition.ts';
import { ProductRefSchema } from '../../shared/resources/product.ts';
import { VariantRefSchema } from '../../shared/resources/variant.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const ref = (type: string, id: string) => ({
  moduleId: 'commerce.catalog' as const,
  resourceId: id,
  resourceType: `commerce.catalog.${type}`,
  tenantId,
});
const productRef = Schema.decodeUnknownSync(ProductRefSchema)(ref('product', '22222222-2222-4222-8222-222222222222'));
const variantRef = Schema.decodeUnknownSync(VariantRefSchema)(ref('variant', '33333333-3333-4333-8333-333333333333'));
const unitRef = Schema.decodeUnknownSync(CatalogResourceRefSchema)(
  ref('product-unit', '44444444-4444-4444-8444-444444444444'),
);
const componentProduct = Schema.decodeUnknownSync(ProductRefSchema)(
  ref('product', '55555555-5555-4555-8555-555555555555'),
);
const componentVariant = Schema.decodeUnknownSync(VariantRefSchema)(
  ref('variant', '66666666-6666-4666-8666-666666666666'),
);
const selection = { productRef: componentProduct, variantRef: componentVariant };
const components = [
  { componentId: '77777777-7777-4777-8777-777777777777', quantity: { amount: '2', unitRef }, selection },
  { componentId: '88888888-8888-4888-8888-888888888888', quantity: { amount: '4', unitRef }, selection },
] as const;
const revision = {
  components,
  productRef,
  provenance: { changeKind: 'INITIAL', evidenceRefs: [], reason: 'Initial exact set' },
  reference: { resourceRef: ref('set-composition', '99999999-9999-4999-8999-999999999999'), revision: 1 },
  variantRef,
};

describe('Set composition', () => {
  it('pins ordered stable needs and sums repeated exact selections once', () => {
    const issued = Schema.decodeUnknownSync(SetCompositionRevisionSchema)(revision);
    expect(issued.components.map((component) => component.componentId)).toEqual(
      components.map((item) => item.componentId),
    );
    expect(summarizeSetComponents(issued.components)).toMatchObject([
      { amount: '6', componentIds: [components[0].componentId, components[1].componentId] },
    ]);
  });

  it('rejects incomplete, zero, duplicate, and nested compositions', () => {
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [{ ...components[0], selection: { productRef } }, components[1]],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [{ ...components[0], selection: { productRef, variantRef } }, components[1]],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [
          { ...components[0], quantity: { amount: '2', unitRef: ref('product', unitRef.resourceId) } },
          components[1],
        ],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({ ...revision, components: [components[0]] }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [{ ...components[0], quantity: { amount: '0', unitRef } }, components[1]],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [components[0], { ...components[1], componentId: components[0].componentId }],
      }),
    ).toThrow();
    expect(() =>
      Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
        ...revision,
        components: [
          { ...components[0], selection: { ...selection, setComposition: revision.reference } },
          components[1],
        ],
      }),
    ).toThrow();
  });

  it('does not merge different exact Variants or package choices', () => {
    const otherVariant = Schema.decodeUnknownSync(VariantRefSchema)(
      ref('variant', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
    );
    const issued = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
      ...revision,
      components: [components[0], { ...components[1], selection: { ...selection, variantRef: otherVariant } }],
    });
    expect(summarizeSetComponents(issued.components).map((item) => item.amount)).toEqual(['2', '4']);
  });

  it('keeps exact package content revisions separate', () => {
    const packageRef = ref('package-definition', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const packageOption = {
      contentRevision: { resourceRef: packageRef, revision: 1 },
      optionRef: packageRef,
    };
    const withPackage = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
      ...revision,
      components: [
        { ...components[0], selection: { ...selection, packageOption } },
        {
          ...components[1],
          selection: {
            ...selection,
            packageOption: { ...packageOption, contentRevision: { resourceRef: packageRef, revision: 2 } },
          },
        },
      ],
    });
    expect(summarizeSetComponents(withPackage.components).map(({ amount }) => amount)).toEqual(['2', '4']);
    expect(
      classifySetCompositionChange(Schema.decodeUnknownSync(SetCompositionRevisionSchema)(revision), withPackage),
    ).toBe('MATERIAL_CHANGE');
  });

  it('distinguishes an evidence correction from a material successor without overwriting R1', () => {
    const original = Schema.decodeUnknownSync(SetCompositionRevisionSchema)(revision);
    const corrected = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
      ...revision,
      predecessor: revision.reference,
      provenance: { changeKind: 'EVIDENCE_CORRECTION', evidenceRefs: ['correction-1'], reason: 'Corrected evidence' },
      reference: { ...revision.reference, revision: 2 },
    });
    expect(classifySetCompositionChange(original, corrected)).toBe('SAME_CONTENT');
    const changed = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
      ...revision,
      components: [components[0], { ...components[1], quantity: { amount: '3', unitRef } }],
      predecessor: revision.reference,
      provenance: { changeKind: 'MATERIAL_CHANGE', evidenceRefs: ['change-1'], reason: 'One fewer bracket' },
      reference: { ...revision.reference, revision: 2 },
    });
    expect(classifySetCompositionChange(original, changed)).toBe('MATERIAL_CHANGE');
    expect(original.components[1]?.quantity.amount).toBe('4');
  });

  it('treats reordered and re-keyed needs as the same exact content without losing multiplicity', () => {
    const original = Schema.decodeUnknownSync(SetCompositionRevisionSchema)(revision);
    const rekeyed = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
      ...revision,
      components: [
        { ...components[1], componentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
        { ...components[0], componentId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
      ],
    });
    expect(classifySetCompositionChange(original, rekeyed)).toBe('SAME_CONTENT');

    const duplicated = Schema.decodeUnknownSync(SetCompositionRevisionSchema)({
      ...revision,
      components: [components[0], { ...components[0], componentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }],
    });
    expect(classifySetCompositionChange(original, duplicated)).toBe('MATERIAL_CHANGE');
  });
});
