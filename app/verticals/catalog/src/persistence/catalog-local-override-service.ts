import { Effect, Option, Schema } from 'effect';

import type { CatalogLocalOverrideOperation } from '../domain/catalog-local-override.ts';
import {
  catalogLocalOverridePermission,
  decideCatalogLocalOverrideTransition,
} from '../domain/catalog-local-override.ts';
import type {
  CatalogCurrentResolution,
  CatalogFactAdmission,
  CatalogFactScope,
  CatalogLocalOverride,
} from '../domain/catalog-source-resolution.ts';
import { resolveCatalogSourceFact } from '../domain/catalog-source-resolution.ts';
import { decideCatalogResolvedCurrentChange } from './catalog-resolved-current-event-seam.ts';
import type {
  CatalogFactAdmissionPorts,
  CatalogResolvedCurrentChangeCause,
  CatalogResolvedCurrentEventPorts,
  CatalogSourceResolutionPorts,
  CatalogSourceResolutionUnavailable,
} from './catalog-source-resolution-ports.ts';

export interface CatalogLocalOverrideActivation<Value> {
  readonly at: Date;
  readonly evidenceRef: string;
  readonly principalId: string;
  readonly reason: string;
  readonly scope: CatalogFactScope;
  readonly value: Value;
}

export interface CatalogLocalOverrideChange<Value> extends CatalogLocalOverrideActivation<Value> {
  readonly expectedRevision: bigint;
}

export interface CatalogLocalOverrideRelease {
  readonly at: Date;
  readonly evidenceRef: string;
  readonly expectedRevision: bigint;
  readonly principalId: string;
  readonly reason: string;
  readonly scope: CatalogFactScope;
}

export type CatalogLocalOverrideOperationResult<Value> =
  | {
      readonly action: CatalogLocalOverrideOperation;
      readonly override: CatalogLocalOverride<Value>;
      readonly resolved: CatalogCurrentResolution<Value>;
      readonly resolvedCurrentChanged: boolean;
      readonly status: 'APPLIED';
    }
  | {
      readonly reason: string;
      readonly status:
        | 'PERMISSION_REQUIRED'
        | 'FORBIDDEN_FACT'
        | 'NO_AUTHORITY'
        | 'NO_ACTIVE_OVERRIDE'
        | 'ALREADY_ACTIVE'
        | 'ALREADY_RELEASED'
        | 'STALE_EDITOR'
        | 'INVALID'
        | 'CONFLICT'
        | 'UNAVAILABLE'
        | 'INDETERMINATE';
    };

export interface CatalogLocalOverrideWiring<Value> {
  readonly admission: CatalogFactAdmissionPorts<Value>;
  readonly events: CatalogResolvedCurrentEventPorts<Value>;
  readonly store: CatalogSourceResolutionPorts<Value>;
  readonly valuesEqual: (left: Value, right: Value) => boolean;
}

const activeOverrideValue = <Value>(
  overrides: readonly CatalogLocalOverride<Value>[],
  scope: CatalogFactScope,
): Value | null => {
  let latest: CatalogLocalOverride<Value> | null = null;
  for (const override of overrides) {
    if (
      override.scope.tenantId === scope.tenantId &&
      override.scope.targetKind === scope.targetKind &&
      override.scope.targetId === scope.targetId &&
      override.scope.factKey === scope.factKey &&
      override.lifecycle === 'ACTIVE' &&
      (latest === null || override.revision > latest.revision)
    ) {
      latest = override;
    }
  }
  return latest === null ? null : latest.value;
};

const CatalogLocalOverrideTransitionFailureStatusSchema = Schema.Literals([
  'PERMISSION_REQUIRED',
  'FORBIDDEN_FACT',
  'NO_ACTIVE_OVERRIDE',
  'ALREADY_ACTIVE',
  'ALREADY_RELEASED',
  'STALE_EDITOR',
  'INDETERMINATE',
]);
type CatalogLocalOverrideTransitionFailureStatus = typeof CatalogLocalOverrideTransitionFailureStatusSchema.Type;

const transitionFailure = <Value>(
  status: CatalogLocalOverrideTransitionFailureStatus,
  reason: string,
): CatalogLocalOverrideOperationResult<Value> => ({ reason, status });

const operationChangeCause = {
  ACTIVATE: 'OVERRIDE_ACTIVATED',
  CHANGE: 'OVERRIDE_CHANGED',
  RELEASE: 'OVERRIDE_RELEASED',
} as const satisfies Record<CatalogLocalOverrideOperation, CatalogResolvedCurrentChangeCause>;

/**
 * One explicit Catalog decision over one exact Catalog-owned fact/scope. Permission, ownership,
 * validity, single-active-winner compare-and-set, and release-to-latest-base are all enforced here;
 * a released override never remains secretly active and a mere base update never claims a change.
 */
export const makeCatalogLocalOverrideService = <Value>(wiring: CatalogLocalOverrideWiring<Value>) => {
  const runOperation = Effect.fn('CatalogLocalOverride.runOperation')(function* runOperation(input: {
    readonly at: Date;
    readonly evidenceRef: string;
    readonly expectedRevision: bigint | null;
    readonly operation: CatalogLocalOverrideOperation;
    readonly principalId: string;
    readonly reason: string;
    readonly scope: CatalogFactScope;
    readonly value: Value | null;
  }): Effect.fn.Return<CatalogLocalOverrideOperationResult<Value>, CatalogSourceResolutionUnavailable> {
    const admissionOption = yield* wiring.admission.readAdmission(input.scope);
    const admission = Option.getOrNull(admissionOption);
    if (admission === null) {
      return { reason: 'Catalog fact admission is unavailable', status: 'UNAVAILABLE' };
    }
    if (admission.factOwnership !== 'CATALOG_LOCAL') {
      return { reason: 'Local Override may only hold a Catalog-owned fact', status: 'NO_AUTHORITY' };
    }
    const authorized = yield* wiring.admission.authorizeOverrideOperation({
      operation: input.operation,
      permissionKey: catalogLocalOverridePermission[input.operation],
      principalId: input.principalId,
      scope: input.scope,
    });
    const overrides = yield* wiring.store.readOverrides(input.scope);
    const transition = decideCatalogLocalOverrideTransition({
      authorized,
      expectedRevision: input.expectedRevision,
      operation: input.operation,
      overrides,
      scope: input.scope,
    });
    if (transition.status !== 'PROCEED') {
      return transitionFailure<Value>(transition.status, transition.reason);
    }
    const value = input.operation === 'RELEASE' ? activeOverrideValue(overrides, input.scope) : input.value;
    if (value === null) {
      return { reason: 'Local Override requires a value for this exact Catalog fact', status: 'INVALID' };
    }
    if (input.operation !== 'RELEASE') {
      const valueValid = yield* wiring.admission.isOverrideValueValid({
        principalId: input.principalId,
        scope: input.scope,
        value,
      });
      if (!valueValid) {
        return { reason: 'Local Override value is not valid for the Catalog fact', status: 'INVALID' };
      }
    }
    const override: CatalogLocalOverride<Value> = {
      actorPrincipalId: input.principalId,
      evidenceRef: input.evidenceRef,
      lifecycle: input.operation === 'RELEASE' ? 'RELEASED' : 'ACTIVE',
      reason: input.reason,
      revision: transition.nextRevision,
      scope: input.scope,
      value,
    };
    const bases = yield* wiring.store.readAcceptedBases(input.scope);
    const resolutionAdmission: CatalogFactAdmission = {
      factOwnership: admission.factOwnership,
      overridePermitted: true,
      overrideValueValid: true,
    };
    const previous = resolveCatalogSourceFact({
      acceptedBases: bases,
      admission: resolutionAdmission,
      at: input.at,
      overrides,
      scope: input.scope,
      valuesEqual: wiring.valuesEqual,
    });
    const next = resolveCatalogSourceFact({
      acceptedBases: bases,
      admission: resolutionAdmission,
      at: input.at,
      overrides: [...overrides, override],
      scope: input.scope,
      valuesEqual: wiring.valuesEqual,
    });
    const append = yield* wiring.store.appendOverrideRevision({
      expectedRevision: input.operation === 'ACTIVATE' ? null : input.expectedRevision,
      override,
    });
    if (append.status === 'CONFLICT') {
      return { reason: append.reason, status: 'CONFLICT' };
    }
    const change = decideCatalogResolvedCurrentChange({ next, previous, valuesEqual: wiring.valuesEqual });
    if (change.kind === 'CHANGED') {
      yield* wiring.events.emitResolvedCurrentChanged({
        cause: operationChangeCause[input.operation],
        next: change.next,
        previous: change.previous,
        scope: input.scope,
      });
    }
    return {
      action: input.operation,
      override,
      resolved: next,
      resolvedCurrentChanged: change.kind === 'CHANGED',
      status: 'APPLIED',
    };
  });

  return {
    activate: Effect.fn('CatalogLocalOverride.activate')(function* activate(
      input: CatalogLocalOverrideActivation<Value>,
    ) {
      return yield* runOperation({
        at: input.at,
        evidenceRef: input.evidenceRef,
        expectedRevision: null,
        operation: 'ACTIVATE',
        principalId: input.principalId,
        reason: input.reason,
        scope: input.scope,
        value: input.value,
      });
    }),
    change: Effect.fn('CatalogLocalOverride.change')(function* change(input: CatalogLocalOverrideChange<Value>) {
      return yield* runOperation({
        at: input.at,
        evidenceRef: input.evidenceRef,
        expectedRevision: input.expectedRevision,
        operation: 'CHANGE',
        principalId: input.principalId,
        reason: input.reason,
        scope: input.scope,
        value: input.value,
      });
    }),
    release: Effect.fn('CatalogLocalOverride.release')(function* release(input: CatalogLocalOverrideRelease) {
      return yield* runOperation({
        at: input.at,
        evidenceRef: input.evidenceRef,
        expectedRevision: input.expectedRevision,
        operation: 'RELEASE',
        principalId: input.principalId,
        reason: input.reason,
        scope: input.scope,
        value: null,
      });
    }),
  };
};
