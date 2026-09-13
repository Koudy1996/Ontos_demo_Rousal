import type { ComponentType } from 'react';

import type { ResolvedModuleTarget } from '../../shared/api.ts';

export type ApprovedVerticalPageComponent = ComponentType<{
  readonly routeParams: Readonly<Record<string, string>>;
  readonly target: ResolvedModuleTarget;
}>;

export interface ApprovedVerticalPageClient {
  readonly appId: string;
  readonly componentKey: string;
  readonly load: () => Promise<{
    readonly default: ApprovedVerticalPageComponent;
  }>;
}

/** Codesmith-owned allowlist. Executable imports remain lazy and owner-deployment-specific. */
export const ultramodernVerticalClients: readonly ApprovedVerticalPageClient[] = [
  // @ontos-codegen-start shell-page-clients
  {
    appId: 'party-registry',
    componentKey: 'party.registry.page-contacts',
    // @effect-diagnostics-next-line asyncFunction:off -- Module Federation loaders must return the native import Promise; remove-when: the framework accepts Effect loaders.
    load: async () => await import('partyRegistry/PageContacts'),
  },
  // @ontos-codegen-end shell-page-clients
];

export const findApprovedVerticalPageClient = (
  target: Pick<ResolvedModuleTarget, 'appId' | 'componentKey'>,
): ApprovedVerticalPageClient | undefined =>
  ultramodernVerticalClients.find(
    (client) => client.appId === target.appId && client.componentKey === target.componentKey,
  );
