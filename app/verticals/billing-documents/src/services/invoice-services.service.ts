import type { ReadServiceFactory, ReadRuntime } from '@app/core-runtime';
import type { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { Effect } from 'effect';
import type { BillingOwnerGatewayCredentialService } from '../../shared/domain/owner-gateway-credential.ts';
import { invoicePersistenceService } from './invoice-persistence.service.ts';
import type { InvoicePersistence } from './invoice-persistence.service.ts';
import { jobsReader, legalEntityReader, partyReader, paymentTermsReader } from './owner-readers.service.ts';
import type { JobsReader, LegalEntityReader, PartyReader, PaymentTermsReader } from './owner-readers.service.ts';

export type InvoiceServices = InvoicePersistence & {
  readonly jobs: JobsReader;
  readonly legalEntity: LegalEntityReader;
  readonly party: PartyReader;
  readonly paymentTerms: PaymentTermsReader;
};

export const invoiceServices: ReadServiceFactory<
  InvoiceServices,
  GatewayPrincipalVerifierConfiguration | BillingOwnerGatewayCredentialService | ReadRuntime
> = Effect.fn('InvoiceServices.make')(function* makeInvoiceServices(transaction, scope) {
  const [store, jobs, legalEntity, party, paymentTerms] = yield* Effect.all(
    [
      invoicePersistenceService(transaction, scope),
      jobsReader(scope),
      legalEntityReader(scope),
      partyReader(scope),
      paymentTermsReader(scope),
    ],
    { concurrency: 5 },
  );
  return { ...store, jobs, legalEntity, party, paymentTerms };
});
