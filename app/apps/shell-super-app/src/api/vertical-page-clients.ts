import { Effect as PageLoadEffect } from 'effect';
import type { TimeoutError, UnknownError } from 'effect/Cause';
import type { ComponentType } from 'react';

import type { ResolvedModuleTarget } from '../../shared/api.ts';

export type ApprovedVerticalPageComponent = ComponentType<{
  readonly routeParams: Readonly<Record<string, string>>;
  readonly target: ResolvedModuleTarget;
}>;

export interface ApprovedVerticalPageClient {
  readonly appId: string;
  readonly componentKey: string;
  readonly load: PageLoadEffect.Effect<
    {
      readonly default: ApprovedVerticalPageComponent;
    },
    UnknownError | TimeoutError
  >;
}

/** Codesmith-owned allowlist. Executable imports remain lazy and owner-deployment-specific. */
export const ultramodernVerticalClients: readonly ApprovedVerticalPageClient[] = [
  // @ontos-codegen-start shell-page-clients
  {
    appId: 'party-registry',
    componentKey: 'party.registry.page-contacts',
    load: PageLoadEffect.tryPromise(
      (): PromiseLike<{ readonly default: ApprovedVerticalPageComponent }> => import('partyRegistry/PageContacts'),
    ).pipe(PageLoadEffect.timeout('5 seconds')),
  },
  {
    appId: 'sales-inquiries',
    componentKey: 'sales.inquiries.page-inquiries',
    load: PageLoadEffect.tryPromise(
      (): PromiseLike<{ readonly default: ApprovedVerticalPageComponent }> => import('salesInquiries/PageInquiries'),
    ).pipe(PageLoadEffect.timeout('5 seconds')),
  },
  {
    appId: 'service-jobs',
    componentKey: 'service.jobs.page-jobs',
    load: PageLoadEffect.tryPromise(
      (): PromiseLike<{ readonly default: ApprovedVerticalPageComponent }> => import('serviceJobs/PageJobs'),
    ).pipe(PageLoadEffect.timeout('5 seconds')),
  },
  // @ontos-codegen-end shell-page-clients
];

export const findApprovedVerticalPageClient = (
  target: Pick<ResolvedModuleTarget, 'appId' | 'componentKey'>,
): ApprovedVerticalPageClient | undefined =>
  ultramodernVerticalClients.find(
    (client) => client.appId === target.appId && client.componentKey === target.componentKey,
  );
