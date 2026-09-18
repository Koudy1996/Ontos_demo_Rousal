import { describe, expect, it } from 'effect-rstest';

import { assessCatalogSourceAssertion, resolveCatalogSourceFact } from '../../src/domain/catalog-source-resolution.ts';

const scope = { factKey: 'height', targetId: 'product-1', targetKind: 'PRODUCT', tenantId: 'tenant-1' } as const;
const at = new Date('2026-09-18T12:00:00.000Z');
const authority = { issuerSystemId: 'source-1', scope, status: 'VERIFIED' } as const;
const base80 = {
  assertionId: 'assertion-r1',
  effectiveFrom: new Date('2026-09-01T00:00:00.000Z'),
  evidencedAt: new Date('2026-09-02T00:00:00.000Z'),
  issuerSystemId: 'source-1',
  scope,
  sourceRecordId: 'record-1',
  sourceRevision: 1n,
  value: '80 cm',
  valueFingerprint: 'height:80cm',
};
const base95 = {
  ...base80,
  assertionId: 'assertion-r2',
  sourceRevision: 2n,
  value: '95 cm',
  valueFingerprint: 'height:95cm',
};
const override90 = {
  actorPrincipalId: 'principal-1',
  evidenceRef: 'evidence-1',
  lifecycle: 'ACTIVE',
  reason: 'Measured correction',
  revision: 1n,
  scope,
  value: '90 cm',
} as const;

describe('Catalog source authority and Local Override resolution', () => {
  it('accepts a newer base beneath an active override, then release reveals the latest accepted base', () => {
    expect(resolveCatalogSourceFact({ acceptedBase: base80, at, overrides: [override90], scope })).toEqual({
      source: 'LOCAL_OVERRIDE',
      status: 'CURRENT',
      value: '90 cm',
    });
    const accepted = assessCatalogSourceAssertion({
      activeOverride: override90,
      assertion: base95,
      at,
      authority,
      currentBase: base80,
      targetVerified: true,
      valueValid: true,
    });
    expect(accepted).toEqual({ base: base95, currentChanged: false, status: 'ACCEPTED' });
    expect(
      resolveCatalogSourceFact({
        acceptedBase: base95,
        at,
        overrides: [{ ...override90, lifecycle: 'RELEASED' }],
        scope,
      }),
    ).toEqual({
      source: 'BASE',
      status: 'CURRENT',
      value: '95 cm',
    });
  });

  it('returns duplicate and stale without replacing the accepted base', () => {
    const common = {
      activeOverride: null,
      at,
      authority,
      currentBase: base95,
      targetVerified: true,
      valueValid: true,
    };
    expect(assessCatalogSourceAssertion({ ...common, assertion: base95 }).status).toBe('DUPLICATE');
    expect(assessCatalogSourceAssertion({ ...common, assertion: base80 }).status).toBe('STALE');
    expect(
      assessCatalogSourceAssertion({ ...common, assertion: { ...base95, valueFingerprint: 'different' } }).status,
    ).toBe('INDETERMINATE');
  });

  it('fails closed for wrong Tenant, unverified target or authority, and incomparable source records', () => {
    const common = { activeOverride: null, at, currentBase: base80, targetVerified: true, valueValid: true };
    expect(assessCatalogSourceAssertion({ ...common, assertion: base95, authority: null }).status).toBe('NO_AUTHORITY');
    expect(
      assessCatalogSourceAssertion({ ...common, assertion: base95, authority, targetVerified: false }).status,
    ).toBe('INDETERMINATE');
    expect(
      assessCatalogSourceAssertion({
        ...common,
        assertion: { ...base95, scope: { ...scope, tenantId: 'other' } },
        authority,
      }).status,
    ).toBe('NO_AUTHORITY');
    expect(
      assessCatalogSourceAssertion({ ...common, assertion: { ...base95, sourceRecordId: 'other' }, authority }).status,
    ).toBe('INDETERMINATE');
    expect(
      assessCatalogSourceAssertion({ ...common, assertion: { ...base95, issuerSystemId: 'other' }, authority }).status,
    ).toBe('NO_AUTHORITY');
  });

  it('does not treat arrival time, omission, or a released override as a Current value', () => {
    const deliveredLater = { ...base80, evidencedAt: new Date('2026-09-18T11:00:00.000Z') };
    expect(
      assessCatalogSourceAssertion({
        activeOverride: null,
        assertion: deliveredLater,
        at,
        authority,
        currentBase: base95,
        targetVerified: true,
        valueValid: true,
      }).status,
    ).toBe('STALE');
    expect(
      resolveCatalogSourceFact({
        acceptedBase: null,
        at,
        overrides: [{ ...override90, lifecycle: 'RELEASED' }],
        scope,
      }).status,
    ).toBe('ABSENT');
    expect(
      resolveCatalogSourceFact({
        acceptedBase: base95,
        at,
        overrides: [override90, { ...override90, revision: 2n }],
        scope,
      }).status,
    ).toBe('INDETERMINATE');
  });

  it('does not accept invalid, expired, or unverifiable assertion values', () => {
    const common = { activeOverride: null, at, authority, currentBase: null, targetVerified: true };
    expect(assessCatalogSourceAssertion({ ...common, assertion: base80, valueValid: false }).status).toBe('INVALID');
    expect(
      assessCatalogSourceAssertion({ ...common, assertion: { ...base80, effectiveTo: at }, valueValid: true }).status,
    ).toBe('INVALID');
    expect(
      assessCatalogSourceAssertion({ ...common, assertion: { ...base80, sourceRevision: -1n }, valueValid: true })
        .status,
    ).toBe('INVALID');
  });
});
