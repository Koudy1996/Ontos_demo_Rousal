import { Config, Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';

export const operationsDashboardCors = (shellOrigin: string) =>
  HttpRouter.cors({
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Authorization',
      'Content-Type',
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

export const OperationsDashboardCorsLive = Layer.unwrap(
  Config.string('ONTOS_GATEWAY_ISSUER').pipe(Effect.map(operationsDashboardCors)),
);
