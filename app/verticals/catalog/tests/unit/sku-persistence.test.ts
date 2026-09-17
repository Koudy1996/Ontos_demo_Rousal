import { describe, expect, it } from 'effect-rstest';

import { currentPackageOptionSnapshotMatches, validSkuChangeInput } from '../../src/persistence/sku-persistence.ts';

const base = {
  actionInvocationId: '00000000-0000-4000-8000-000000000001',
  code: '  Ab-12  ',
  evidenceRefs: ['source:1'],
  expectedRevision: 0,
  principalId: '00000000-0000-4000-8000-000000000002',
  reason: 'Verified against source',
  target: { kind: 'VARIANT', tenantId: 'tenant-a', variantId: '00000000-0000-4000-8000-000000000003' },
} as const;

describe('SKU persistence input guard', () => {
  it('accepts a tenant-scoped Variant and preserves display spelling', () => {
    expect(validSkuChangeInput(base, 'tenant-a')).toBe(true);
    expect(base.code).toBe('  Ab-12  ');
  });

  it('rejects cross-tenant, blank, and overlong comparison codes', () => {
    expect(validSkuChangeInput(base, 'tenant-b')).toBe(false);
    expect(validSkuChangeInput({ ...base, code: '  ' }, 'tenant-a')).toBe(false);
    expect(validSkuChangeInput({ ...base, code: 'A'.repeat(241) }, 'tenant-a')).toBe(false);
  });

  it('requires bounded, trimmed reason and durable evidence', () => {
    expect(validSkuChangeInput({ ...base, reason: ' ' }, 'tenant-a')).toBe(false);
    expect(validSkuChangeInput({ ...base, reason: ' padded ' }, 'tenant-a')).toBe(false);
    expect(validSkuChangeInput({ ...base, evidenceRefs: [] }, 'tenant-a')).toBe(false);
    expect(validSkuChangeInput({ ...base, evidenceRefs: [' '] }, 'tenant-a')).toBe(false);
    expect(validSkuChangeInput({ ...base, expectedRevision: -1 }, 'tenant-a')).toBe(false);
    expect(validSkuChangeInput({ ...base, actionInvocationId: 'not-a-uuid' }, 'tenant-a')).toBe(false);
  });
});

describe('SKU Package Option Current proof', () => {
  const now = new Date('2026-09-17T10:00:00.000Z');
  const active = {
    content: {
      effectiveAt: new Date('2026-09-16T10:00:00.000Z'),
      lifecycleState: 'ACTIVE',
      productId: 'product-a',
      unitResourceType: 'commerce.catalog.product-unit',
      variantId: 'variant-a',
    },
    contentRevision: 4,
    definition: {
      currentOptionRevision: 2,
      currentRevision: 4,
      lifecycleState: 'ACTIVE',
      optionState: 'ACTIVE',
      productId: 'product-a',
      variantId: 'variant-a',
    },
    now,
    productLifecycle: 'ACTIVE',
    role: {
      contentRevision: 4,
      effectiveAt: new Date('2026-09-16T11:00:00.000Z'),
      independentlyRequested: true,
      looseUnitsSubstitutable: false,
      productId: 'product-a',
      revision: 2,
      state: 'ACTIVE',
      variantId: 'variant-a',
    },
    unitLifecycle: 'ACTIVE',
    variantLifecycle: 'ACTIVE',
  } as const;

  it('accepts only pinned active role and content for an independent Option', () => {
    expect(currentPackageOptionSnapshotMatches(active)).toBe(true);
    expect(currentPackageOptionSnapshotMatches({ ...active, contentRevision: 3 })).toBe(false);
    expect(currentPackageOptionSnapshotMatches({ ...active, role: { ...active.role, contentRevision: 3 } })).toBe(
      false,
    );
    expect(currentPackageOptionSnapshotMatches({ ...active, role: { ...active.role, revision: 1 } })).toBe(false);
    expect(
      currentPackageOptionSnapshotMatches({ ...active, role: { ...active.role, looseUnitsSubstitutable: true } }),
    ).toBe(false);
  });

  it('rejects future or retired Current basis and parent lifecycle loss', () => {
    expect(
      currentPackageOptionSnapshotMatches({ ...active, definition: { ...active.definition, optionState: 'RETIRED' } }),
    ).toBe(false);
    expect(currentPackageOptionSnapshotMatches({ ...active, productLifecycle: 'RETIRED' })).toBe(false);
    expect(
      currentPackageOptionSnapshotMatches({
        ...active,
        content: { ...active.content, effectiveAt: new Date('2026-09-18T00:00:00.000Z') },
      }),
    ).toBe(false);
  });
});
