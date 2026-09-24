import { Config, Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

/** The verified staff issuer is the only browser origin trusted by this deployment. */
export const billingDocumentsCors = (shellOrigin: string) =>
  HttpRouter.cors({
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'Traceparent',
      'X-Correlation-Id',
      'X-Modernjs-Bff-Operation-Context',
      'X-Operation-Id',
      'X-Ontos-Dependency-Authorization',
    ],
    allowedMethods: ['GET', 'HEAD', 'OPTIONS', 'POST'],
    allowedOrigins: [shellOrigin],
    maxAge: 600,
  });

export const BillingDocumentsCorsLive = Layer.unwrap(
  Config.string('ONTOS_GATEWAY_ISSUER').pipe(Effect.map(billingDocumentsCors)),
);
