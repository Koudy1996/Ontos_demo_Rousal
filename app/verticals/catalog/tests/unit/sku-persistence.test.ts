import { describe, expect, it } from 'effect-rstest';

import { validSkuChangeInput } from '../../src/persistence/sku-persistence.ts';

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
