import { pathToFileURL } from 'node:url';
import path from 'node:path';

import { NodeServices } from '@effect/platform-node';
import { Config, ConfigProvider, Console, Effect, Redacted, Schema } from 'effect';

import { parseDatabaseConnectionPair } from '../packages/core-runtime/src/db/config.ts';
import {
  LOCAL_DEVELOPMENT_CONTEXT,
  LocalDevelopmentInitializationError,
  initializeFixedDemoContext,
} from './initialize-local-development.mts';

const fail = (reason: string) =>
  new LocalDevelopmentInitializationError({ code: 'local_configuration_invalid', reason });

const HostedDemoEnvironment = Config.all({
  authBaseUrl: Config.string('BETTER_AUTH_URL'),
  authSecret: Config.redacted('BETTER_AUTH_SECRET'),
  databaseAdminUrl: Config.redacted('DATABASE_ADMIN_URL'),
  databaseUrl: Config.redacted('DATABASE_URL'),
  deploymentEnvironment: Config.schema(Schema.Literal('stage'), 'ULTRAMODERN_DEPLOYMENT_ENVIRONMENT'),
  gatewayApiKey: Config.redacted('ONTOS_DEMO_GATEWAY_API_KEY'),
  password: Config.redacted('ONTOS_DEMO_PASSWORD'),
  spiceDbEndpoint: Config.string('SPICEDB_ENDPOINT'),
  spiceDbPreSharedKey: Config.redacted('SPICEDB_PRESHARED_KEY'),
});

const hostedSpiceDbEndpoint = 'spicedb.vyklizeni-sos-demo.internal.zaneops:50051';

const loadConfiguration = Effect.gen(function* loadHostedDemoConfiguration() {
  const source = yield* HostedDemoEnvironment.parse(ConfigProvider.fromEnv()).pipe(
    Effect.mapError(() => fail('The hosted demo configuration is incomplete or invalid')),
  );
  const authUrl = URL.parse(source.authBaseUrl);
  if (
    authUrl === null ||
    authUrl.protocol !== 'https:' ||
    authUrl.origin !== source.authBaseUrl ||
    authUrl.username.length > 0 ||
    authUrl.password.length > 0
  ) {
    return yield* fail('BETTER_AUTH_URL must be an exact credential-free HTTPS origin');
  }
  if (Redacted.value(source.authSecret).trim().length < 32) {
    return yield* fail('BETTER_AUTH_SECRET must contain at least 32 characters');
  }
  if (Redacted.value(source.gatewayApiKey).trim().length < 32) {
    return yield* fail('ONTOS_DEMO_GATEWAY_API_KEY must contain at least 32 characters');
  }
  if (Redacted.value(source.password).length < 12) {
    return yield* fail('ONTOS_DEMO_PASSWORD must contain at least 12 characters');
  }
  if (source.spiceDbEndpoint !== hostedSpiceDbEndpoint) {
    return yield* fail(`The hosted demo expects its private SpiceDB service on ${hostedSpiceDbEndpoint}`);
  }
  const databasePair = yield* parseDatabaseConnectionPair({
    DATABASE_ADMIN_URL: Redacted.value(source.databaseAdminUrl),
    DATABASE_URL: Redacted.value(source.databaseUrl),
  }).pipe(Effect.mapError((error) => fail(error.reason)));
  return {
    authBaseUrl: authUrl.origin,
    authSecret: Redacted.make(Redacted.value(source.authSecret).trim()),
    databaseAdminUrl: databasePair.admin.connectionString,
    deploymentEnvironment: source.deploymentEnvironment,
    email: LOCAL_DEVELOPMENT_CONTEXT.email,
    gatewayApiKey: Redacted.make(Redacted.value(source.gatewayApiKey).trim()),
    password: Redacted.make(Redacted.value(source.password)),
    principalDisplayName: LOCAL_DEVELOPMENT_CONTEXT.principalDisplayName,
    spiceDbEndpoint: source.spiceDbEndpoint,
    spiceDbInsecureLocal: true,
    spiceDbPreSharedKey: Redacted.make(Redacted.value(source.spiceDbPreSharedKey).trim()),
  };
});

export const initializeHostedDemo = loadConfiguration.pipe(
  Effect.flatMap((configuration) =>
    initializeFixedDemoContext(configuration, {
      secureCookies: true,
      trustedOrigins: [configuration.authBaseUrl],
    }),
  ),
);

const program = Effect.matchEffect(initializeHostedDemo, {
  onFailure: (error) => Console.error(error.reason).pipe(Effect.as(false)),
  onSuccess: (result) =>
    Console.log(
      `Hosted demo initialized for ${result.email}; auth user ${result.authUser}; ${result.moduleIds.length} module(s) active.`,
    ).pipe(Effect.as(true)),
});

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const succeeded = await Effect.runPromise(program.pipe(Effect.provide(NodeServices.layer)));
  if (!succeeded) {
    process.exitCode = 1;
  }
}
