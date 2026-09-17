import { PartyDetailResponseSchema, executePartyDetail } from '@app/party-registry/api/client';
import type { PartyDetailResponse } from '@app/party-registry/api/client';
import { Effect, Option, Predicate, Schema } from 'effect';

import type { ManufacturerTarget } from '../../shared/domain/manufacturer-relation.ts';
import { ManufacturerTargetAbsent } from './manufacturer-target-absent.ts';
import { ManufacturerTargetForbidden } from './manufacturer-target-forbidden.ts';
import { ManufacturerTargetInvalid } from './manufacturer-target-invalid.ts';
import { ManufacturerTargetUnavailable } from './manufacturer-target-unavailable.ts';

export { ManufacturerTargetAbsent } from './manufacturer-target-absent.ts';
export { ManufacturerTargetForbidden } from './manufacturer-target-forbidden.ts';
export { ManufacturerTargetInvalid } from './manufacturer-target-invalid.ts';
export { ManufacturerTargetUnavailable } from './manufacturer-target-unavailable.ts';

/** The tenant and request identity are supplied by the server's revalidated operation scope. */
export interface ManufacturerTargetResolutionScope {
  readonly requestId: string;
  readonly tenantId: string;
}

export interface ResolvedManufacturerTarget {
  readonly canonicalTarget: Extract<ManufacturerTarget, { readonly kind: 'PARTY' }>;
  readonly kind: 'PARTY';
  readonly ownerRevision: number;
  readonly requestedTarget: Extract<ManufacturerTarget, { readonly kind: 'PARTY' }>;
  readonly state: 'CURRENT' | 'ALIAS' | 'ARCHIVED';
}

interface PartyReadFailure {
  readonly _tag: string;
}

export interface ManufacturerTargetResolverPorts {
  readonly readPartyDetail: (
    payload: Parameters<typeof executePartyDetail>[0],
    requestId: string,
  ) => Effect.Effect<PartyDetailResponse, PartyReadFailure>;
}

const partyReadFailure = (failure: PartyReadFailure) => {
  if (Predicate.isTagged(failure, 'PartyDetailNotFoundProblem')) {
    return new ManufacturerTargetAbsent();
  }
  if (
    Predicate.isTagged(failure, 'PartyDetailForbiddenProblem') ||
    Predicate.isTagged(failure, 'PartyDetailAuthenticationProblem')
  ) {
    return new ManufacturerTargetForbidden();
  }
  return new ManufacturerTargetUnavailable();
};

const validPartyDetail = (
  detail: PartyDetailResponse,
  target: Extract<ManufacturerTarget, { readonly kind: 'PARTY' }>,
  tenantId: string,
): boolean => {
  const { party, resolution } = detail;
  return (
    resolution.requestedPartyRef.tenantId === tenantId &&
    resolution.requestedPartyRef.resourceId === target.partyRef.resourceId &&
    resolution.canonicalPartyRef.tenantId === tenantId &&
    party.partyRef.tenantId === tenantId &&
    party.partyRef.resourceId === resolution.canonicalPartyRef.resourceId &&
    Number.isInteger(party.revision) &&
    party.revision > 0 &&
    (resolution.kind === 'ALIAS' || resolution.kind === 'DIRECT')
  );
};

const partyState = (detail: PartyDetailResponse): ResolvedManufacturerTarget['state'] => {
  if (Option.isSome(detail.party.archivedAt)) {
    return 'ARCHIVED';
  }
  return detail.resolution.kind === 'ALIAS' ? 'ALIAS' : 'CURRENT';
};

/** Read-only owner evidence; it never creates an identity or changes the Catalog relation. */
export const makeManufacturerTargetResolver = (configuredPorts?: ManufacturerTargetResolverPorts) => {
  const ports = configuredPorts ?? { readPartyDetail: executePartyDetail };
  return {
    resolve: (
      target: ManufacturerTarget,
      scope: ManufacturerTargetResolutionScope,
    ): Effect.Effect<
      ResolvedManufacturerTarget,
      ManufacturerTargetInvalid | ManufacturerTargetAbsent | ManufacturerTargetForbidden | ManufacturerTargetUnavailable
    > => {
      if (
        scope.tenantId.length === 0 ||
        scope.requestId.length === 0 ||
        (target.kind === 'PARTY' && target.partyRef.tenantId !== scope.tenantId) ||
        (target.kind === 'LEGAL_ENTITY' && target.legalEntityRef.tenantId !== scope.tenantId)
      ) {
        return Effect.fail(
          new ManufacturerTargetInvalid({ reason: 'A trusted matching Tenant and request identity are required' }),
        );
      }
      // Core does not yet publish a governed arbitrary-target Legal Entity read. No inferred identity is safe.
      if (target.kind === 'LEGAL_ENTITY') {
        return Effect.fail(new ManufacturerTargetUnavailable());
      }
      return ports.readPartyDetail({ partyRef: target.partyRef }, scope.requestId).pipe(
        Effect.mapError(partyReadFailure),
        Effect.filterOrFail(Schema.is(PartyDetailResponseSchema), () => new ManufacturerTargetUnavailable()),
        Effect.filterOrFail(
          (detail) => validPartyDetail(detail, target, scope.tenantId),
          () => new ManufacturerTargetUnavailable(),
        ),
        Effect.map((detail) => ({
          canonicalTarget: { kind: 'PARTY' as const, partyRef: detail.resolution.canonicalPartyRef },
          kind: 'PARTY' as const,
          ownerRevision: detail.party.revision,
          requestedTarget: target,
          state: partyState(detail),
        })),
      );
    },
  };
};

export const manufacturerTargetResolver = makeManufacturerTargetResolver();
