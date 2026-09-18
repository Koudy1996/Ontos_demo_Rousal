import { Effect, Option } from 'effect';

import { catalogFactAdmissionForScope, isCatalogSourceFactValueValid } from '../domain/catalog-source-admission.ts';
import { catalogLocalOverridePermission, type CatalogLocalOverrideOperation } from '../domain/catalog-local-override.ts';
import type { CatalogFactAdmissionPorts } from './catalog-source-resolution-ports.ts';

export const catalogSourceAdmissionPorts = (input: {
  readonly allowedOverrideOperation: CatalogLocalOverrideOperation | null;
  readonly principalId: string;
}): CatalogFactAdmissionPorts<unknown> => ({
  authorizeOverrideOperation: ({ operation, permissionKey, principalId, scope }) =>
    Effect.succeed(
      input.allowedOverrideOperation === operation &&
        input.principalId === principalId &&
        permissionKey === catalogLocalOverridePermission[operation] &&
        catalogFactAdmissionForScope(scope)?.admission.overridePermitted === true,
    ),
  isAssertionValueValid: ({ assertion, scope }) => Effect.succeed(isCatalogSourceFactValueValid(scope, assertion.value)),
  isOverrideValueValid: ({ principalId, scope, value }) =>
    Effect.succeed(input.principalId === principalId && isCatalogSourceFactValueValid(scope, value)),
  readAdmission: (scope) => Effect.succeed(Option.fromNullishOr(catalogFactAdmissionForScope(scope)?.admission)),
});
