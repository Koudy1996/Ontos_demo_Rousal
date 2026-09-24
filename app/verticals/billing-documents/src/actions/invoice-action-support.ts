import type { ActionHandlerContext } from '@app/core-runtime';
import type { ServiceJob } from '@app/service-jobs/resources/service-job';
import { DateTime, Effect } from 'effect';
import type { Invoice } from '../../shared/resources/invoice.ts';
import { InvoiceRejected } from '../../shared/resources/invoice-rejected.ts';
import type { InvoiceServices } from '../services/invoice-services.service.ts';

export const recordJobRead = (context: ActionHandlerContext<Record<never, never>, InvoiceServices>, job: ServiceJob) =>
  context.recordDataAccess({
    accessKind: 'read',
    queryHash: `billing-source-job:${job.ref.resourceId}:${job.revision}`,
    resultCount: 1,
    servingModuleKey: 'service.jobs',
    targetModuleKey: 'service.jobs',
    targetResourceId: job.ref.resourceId,
    targetResourceType: 'service.jobs.service-job',
  });

export const assertCompleted = (job: ServiceJob) =>
  job.status === 'COMPLETED'
    ? Effect.void
    : Effect.fail(
        new InvoiceRejected({ code: 'job_not_completed', reason: 'Fakturu lze vytvořit jen z dokončené zakázky' }),
      );

export const assertSourceUnchanged = (invoice: Invoice, job: ServiceJob) => {
  const snapshot = invoice.commercialSnapshot;
  const unchanged =
    job.status === 'COMPLETED' &&
    job.revision >= snapshot.sourceRevision &&
    job.commercialSummary.currency === snapshot.currency &&
    job.commercialSummary.priceBasis === snapshot.priceBasis &&
    job.commercialSummary.total === snapshot.total &&
    DateTime.formatIso(job.acceptedAt) === DateTime.formatIso(snapshot.sourceAcceptedAt) &&
    job.partyRef.resourceId === invoice.customerPartyRef.resourceId &&
    job.ref.resourceId === invoice.sourceJobRef.resourceId;
  return unchanged
    ? Effect.void
    : Effect.fail(
        new InvoiceRejected({
          code: 'source_job_changed',
          reason: 'Zakázka se od vytvoření návrhu faktury změnila; vytvořte nový návrh',
        }),
      );
};
