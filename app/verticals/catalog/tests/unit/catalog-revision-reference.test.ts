import { describe, expect, it } from 'effect-rstest';
import { Schema } from 'effect';

import {
  CatalogRevisionEvidenceSchema,
  CatalogRevisionLookupResultSchema,
  CatalogRevisionReferenceSchema,
  catalogRevisionLookupPreservesReference,
  sameCatalogRevisionReference,
} from '../../shared/domain/catalog-revision-reference.ts';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '99999999-9999-4999-8999-999999999999';
const productId = '22222222-2222-4222-8222-222222222222';
const successorId = '33333333-3333-4333-8333-333333333333';
const variantId = '44444444-4444-4444-8444-444444444444';
const revisionId = '55555555-5555-4555-8555-555555555555';

const productRef = {
  moduleId: 'commerce.catalog',
  resourceId: productId,
  resourceType: 'commerce.catalog.product',
  tenantId,
} as const;
const variantRef = {
  moduleId: 'commerce.catalog',
  resourceId: variantId,
  resourceType: 'commerce.catalog.variant',
  tenantId,
} as const;
const reference = { resourceRef: productRef, revision: 1, revisionId } as const;
const retained = {
  historical: true,
  kind: 'PRODUCT',
  lifecycle: 'RETIRED',
  name: 'Original name',
  reference,
} as const;
const evidence = {
  capturedAt: '2026-09-16T12:00:00.000Z',
  evidenceRefs: ['document-version:original'],
  historical: true,
  reference,
  retained,
} as const;
const decode = <S extends Schema.Top>(schema: S, value: unknown) =>
  Schema.decodeUnknownSync(schema, { onExcessProperty: 'error' })(value);

describe('Catalog revision references and historical lookup', () => {
  it('requires a tenant-qualified exact business revision, not a timestamp or latest alias', () => {
    expect(decode(CatalogRevisionReferenceSchema, reference)).toMatchObject(reference);
    expect(() => decode(CatalogRevisionReferenceSchema, { resourceRef: productRef })).toThrow();
    expect(() => decode(CatalogRevisionReferenceSchema, { ...reference, revision: 0 })).toThrow();
    expect(() => decode(CatalogRevisionReferenceSchema, { ...reference, revision: 'latest' })).toThrow();
    expect(() => decode(CatalogRevisionReferenceSchema, { ...reference, buildRevision: 'abc' })).toThrow();
    expect(() =>
      decode(CatalogRevisionReferenceSchema, {
        ...reference,
        resourceRef: { ...productRef, tenantId: ` ${tenantId}` },
      }),
    ).toThrow();
  });

  it('keeps retired original identity distinct from a successor and a different tenant', () => {
    expect(decode(CatalogRevisionEvidenceSchema, evidence)).toMatchObject(evidence);
    expect(
      sameCatalogRevisionReference(reference, {
        ...reference,
        resourceRef: { ...productRef, resourceId: successorId },
      }),
    ).toBe(false);
    expect(
      sameCatalogRevisionReference(reference, {
        ...reference,
        resourceRef: { ...productRef, tenantId: otherTenantId },
      }),
    ).toBe(false);
    expect(sameCatalogRevisionReference(reference, { ...reference, revision: 2 })).toBe(false);
    expect(sameCatalogRevisionReference(reference, { ...reference, revisionId: undefined })).toBe(false);
  });

  it('retains exact source evidence and rejects a substituted revision, successor or tenant', () => {
    expect(() =>
      decode(CatalogRevisionEvidenceSchema, {
        ...evidence,
        retained: { ...retained, reference: { ...reference, revision: 2 } },
      }),
    ).toThrow();
    expect(() =>
      decode(CatalogRevisionEvidenceSchema, {
        ...evidence,
        retained: {
          ...retained,
          reference: { ...reference, resourceRef: { ...productRef, resourceId: successorId } },
        },
      }),
    ).toThrow();
    expect(() =>
      decode(CatalogRevisionEvidenceSchema, {
        ...evidence,
        retained: {
          ...retained,
          reference: { ...reference, resourceRef: { ...productRef, tenantId: otherTenantId } },
        },
      }),
    ).toThrow();
  });

  it('requires a retained Variant and its Product owner to share the tenant', () => {
    const variantRevision = { resourceRef: variantRef, revision: 1 } as const;
    expect(
      decode(CatalogRevisionEvidenceSchema, {
        ...evidence,
        reference: variantRevision,
        retained: {
          historical: true,
          kind: 'VARIANT',
          lifecycle: 'RETIRED',
          productRef,
          reference: variantRevision,
        },
      }),
    ).toMatchObject({ reference: variantRevision });
    expect(() =>
      decode(CatalogRevisionEvidenceSchema, {
        ...evidence,
        reference: variantRevision,
        retained: {
          historical: true,
          kind: 'VARIANT',
          lifecycle: 'RETIRED',
          productRef: { ...productRef, tenantId: otherTenantId },
          reference: variantRevision,
        },
      }),
    ).toThrow();
  });

  it('distinguishes missing, broken, and unavailable evidence without returning current or successor', () => {
    for (const result of [
      { kind: 'MISSING', requestedReference: reference },
      { kind: 'BROKEN', reason: 'retained evidence unavailable', requestedReference: reference },
      { kind: 'UNAVAILABLE', reason: 'retry later', requestedReference: reference, retryable: true },
    ] as const) {
      expect(decode(CatalogRevisionLookupResultSchema, result)).toMatchObject(result);
      expect(
        catalogRevisionLookupPreservesReference(
          { reference: decode(CatalogRevisionReferenceSchema, reference) },
          decode(CatalogRevisionLookupResultSchema, result),
        ),
      ).toBe(true);
    }
    expect(() =>
      decode(CatalogRevisionLookupResultSchema, { kind: 'CURRENT', requestedReference: reference }),
    ).toThrow();
    expect(() =>
      decode(CatalogRevisionLookupResultSchema, {
        kind: 'FOUND',
        requestedReference: reference,
        evidence: { ...evidence, reference: { ...reference, revision: 2 } },
      }),
    ).toThrow();
  });

  it('checks both a found result declaration and its evidence against the lookup request', () => {
    const request = { reference: decode(CatalogRevisionReferenceSchema, reference) };
    const found = decode(CatalogRevisionLookupResultSchema, { kind: 'FOUND', requestedReference: reference, evidence });
    expect(catalogRevisionLookupPreservesReference(request, found)).toBe(true);
    expect(
      catalogRevisionLookupPreservesReference(request, {
        ...found,
        requestedReference: { ...request.reference, revision: 2 },
      }),
    ).toBe(false);
    expect(
      catalogRevisionLookupPreservesReference(request, {
        ...found,
        evidence: { ...found.evidence, reference: { ...request.reference, revision: 2 } },
      }),
    ).toBe(false);
  });
});
