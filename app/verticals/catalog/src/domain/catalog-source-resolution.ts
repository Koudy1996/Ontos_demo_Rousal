/**
 * A private, pure decision over already verified Catalog evidence. The caller must
 * obtain target and authority verification from their owners; this module never
 * treats a connector, route, arrival timestamp, or caller's external ID as proof.
 */
import { DateTime } from 'effect';

export interface CatalogFactScope {
  readonly factKey: string;
  readonly targetId: string;
  readonly targetKind: 'PRODUCT' | 'VARIANT' | 'PACKAGE_DEFINITION';
  readonly tenantId: string;
}

export interface CatalogSourceAssertion<Value> {
  readonly assertionId: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo?: Date;
  readonly evidencedAt: Date;
  readonly issuerSystemId: string;
  readonly scope: CatalogFactScope;
  readonly sourceRecordId: string;
  readonly sourceRevision: bigint;
  readonly value: Value;
  readonly valueFingerprint: string;
}

export interface CatalogSourceAuthority {
  readonly issuerSystemId: string;
  readonly scope: CatalogFactScope;
  readonly status: 'VERIFIED' | 'UNVERIFIED';
}

export interface CatalogLocalOverride<Value> {
  readonly actorPrincipalId: string;
  readonly evidenceRef: string;
  readonly lifecycle: 'ACTIVE' | 'RELEASED';
  readonly reason: string;
  readonly revision: bigint;
  readonly scope: CatalogFactScope;
  readonly value: Value;
}

export type CatalogAssertionDecision<Value> =
  | { readonly base: CatalogSourceAssertion<Value>; readonly currentChanged: boolean; readonly status: 'ACCEPTED' }
  | { readonly reason: string; readonly status: 'DUPLICATE' | 'STALE' | 'NO_AUTHORITY' | 'INVALID' | 'INDETERMINATE' };

export type CatalogCurrentResolution<Value> =
  | { readonly source: 'BASE' | 'LOCAL_OVERRIDE'; readonly status: 'CURRENT'; readonly value: Value }
  | { readonly reason: string; readonly status: 'ABSENT' | 'INDETERMINATE' };

const sameScope = (left: CatalogFactScope, right: CatalogFactScope): boolean =>
  left.tenantId === right.tenantId &&
  left.targetKind === right.targetKind &&
  left.targetId === right.targetId &&
  left.factKey === right.factKey;

const epoch = (date: Date): number => DateTime.toEpochMillis(DateTime.makeUnsafe(date));
const usableAt = (assertion: CatalogSourceAssertion<unknown>, at: Date): boolean =>
  Number.isFinite(epoch(assertion.effectiveFrom)) &&
  Number.isFinite(epoch(assertion.evidencedAt)) &&
  epoch(assertion.effectiveFrom) <= epoch(at) &&
  (assertion.effectiveTo === undefined ||
    (Number.isFinite(epoch(assertion.effectiveTo)) && epoch(at) < epoch(assertion.effectiveTo)));

const hasRequiredAssertionEvidence = (assertion: CatalogSourceAssertion<unknown>, at: Date): boolean =>
  assertion.assertionId.length > 0 &&
  assertion.sourceRecordId.length > 0 &&
  assertion.valueFingerprint.length > 0 &&
  assertion.sourceRevision >= 0n &&
  Number.isFinite(epoch(at)) &&
  usableAt(assertion, at) &&
  (assertion.effectiveTo === undefined || epoch(assertion.effectiveTo) > epoch(assertion.effectiveFrom));

const compareAcceptedBase = <Value>(
  assertion: CatalogSourceAssertion<Value>,
  currentBase: CatalogSourceAssertion<Value>,
): CatalogAssertionDecision<Value> | null => {
  if (!sameScope(currentBase.scope, assertion.scope)) {
    return { reason: 'Existing base belongs to a different fact or Tenant', status: 'INDETERMINATE' };
  }
  if (
    currentBase.issuerSystemId !== assertion.issuerSystemId ||
    currentBase.sourceRecordId !== assertion.sourceRecordId
  ) {
    return { reason: 'Source revisions are not comparable', status: 'INDETERMINATE' };
  }
  if (assertion.sourceRevision === currentBase.sourceRevision) {
    return assertion.assertionId === currentBase.assertionId &&
      assertion.valueFingerprint === currentBase.valueFingerprint &&
      epoch(assertion.evidencedAt) === epoch(currentBase.evidencedAt) &&
      epoch(assertion.effectiveFrom) === epoch(currentBase.effectiveFrom) &&
      (assertion.effectiveTo === undefined
        ? currentBase.effectiveTo === undefined
        : currentBase.effectiveTo !== undefined && epoch(assertion.effectiveTo) === epoch(currentBase.effectiveTo))
      ? { reason: 'The same source assertion was already accepted', status: 'DUPLICATE' }
      : { reason: 'Conflicting assertions share a source revision', status: 'INDETERMINATE' };
  }
  return assertion.sourceRevision < currentBase.sourceRevision
    ? { reason: 'A newer source revision was already accepted', status: 'STALE' }
    : null;
};

/** Evaluate one assertion against the latest accepted base for this exact fact. */
export const assessCatalogSourceAssertion = <Value>(input: {
  readonly activeOverride: CatalogLocalOverride<Value> | null;
  readonly assertion: CatalogSourceAssertion<Value>;
  readonly at: Date;
  readonly authority: CatalogSourceAuthority | null;
  readonly currentBase: CatalogSourceAssertion<Value> | null;
  readonly targetVerified: boolean;
  readonly valueValid: boolean;
}): CatalogAssertionDecision<Value> => {
  const { activeOverride, assertion, at, authority, currentBase } = input;
  if (!input.targetVerified) {
    return { reason: 'Exact Catalog target is not verified', status: 'INDETERMINATE' };
  }
  if (
    authority?.status !== 'VERIFIED' ||
    authority.issuerSystemId !== assertion.issuerSystemId ||
    !sameScope(assertion.scope, authority.scope)
  ) {
    return { reason: 'Issuer has no verified authority for this exact fact and scope', status: 'NO_AUTHORITY' };
  }
  if (!input.valueValid || !hasRequiredAssertionEvidence(assertion, at)) {
    return { reason: 'Assertion value, provenance, or effective period is invalid or not current', status: 'INVALID' };
  }
  if (
    activeOverride !== null &&
    (activeOverride.lifecycle !== 'ACTIVE' || !sameScope(activeOverride.scope, assertion.scope))
  ) {
    return { reason: 'Override state does not match the exact fact', status: 'INDETERMINATE' };
  }
  if (currentBase !== null) {
    const compared = compareAcceptedBase(assertion, currentBase);
    if (compared !== null) {
      return compared;
    }
  }
  return {
    base: assertion,
    currentChanged: activeOverride === null && currentBase?.valueFingerprint !== assertion.valueFingerprint,
    status: 'ACCEPTED',
  };
};

/** Resolve only from accepted base evidence and the one explicit active override. */
export const resolveCatalogSourceFact = <Value>(input: {
  readonly acceptedBase: CatalogSourceAssertion<Value> | null;
  readonly at: Date;
  readonly overrides: readonly CatalogLocalOverride<Value>[];
  readonly scope: CatalogFactScope;
}): CatalogCurrentResolution<Value> => {
  const { acceptedBase, at, scope } = input;
  if (!Number.isFinite(epoch(at)) || input.overrides.some((override) => !sameScope(override.scope, scope))) {
    return { reason: 'Resolution evidence does not match the exact fact', status: 'INDETERMINATE' };
  }
  const active = input.overrides.filter((override) => override.lifecycle === 'ACTIVE');
  if (active.length > 1) {
    return { reason: 'Multiple active overrides require reconciliation', status: 'INDETERMINATE' };
  }
  if (active.length === 1) {
    const [override] = active;
    if (
      override === undefined ||
      override.actorPrincipalId.length === 0 ||
      override.reason.length === 0 ||
      override.evidenceRef.length === 0
    ) {
      return { reason: 'Active override lacks decision evidence', status: 'INDETERMINATE' };
    }
    return { source: 'LOCAL_OVERRIDE', status: 'CURRENT', value: override.value };
  }
  if (acceptedBase === null) {
    return { reason: 'No accepted authoritative base is available', status: 'ABSENT' };
  }
  if (!sameScope(acceptedBase.scope, scope) || !usableAt(acceptedBase, at)) {
    return { reason: 'Accepted base is not usable for this exact fact and time', status: 'INDETERMINATE' };
  }
  return { source: 'BASE', status: 'CURRENT', value: acceptedBase.value };
};
