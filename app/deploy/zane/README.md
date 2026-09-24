# Vyklízení SOS on ZaneOps

This deployment keeps each OntOS delivery unit in its own runtime service and uses the current
generated public contracts for browser and service-to-service traffic.

## Data services

Create the `data-services` Compose stack from `data-services.compose.yml`. It creates two empty,
persistent PostgreSQL databases and exposes these generated environment overrides:

- `__DATABASE_ADMIN_URL`
- `__DATABASE_URL`
- `__SPICEDB_DATASTORE_CONN_URI`

The stack does not import business data. The migrator applies governed schema migrations and the
hosted initializer creates only the fixed tenant, legal entity, technical principal, authorization
relationships, and demo login required to run the application.

## Git services

Every Git service builds the `Pavel_Siampark` branch with context `app`, Dockerfile
`deploy/zane/Dockerfile`, and the listed target.

| Service | Target | Internal app port | Package |
| --- | --- | ---: | --- |
| `spicedb` | `spicedb-runtime` | 8443 | n/a |
| `migrator` | `migrator` | 8080 | n/a |
| `shell-super-app` | `app-runtime` | 3020 | `@app/shell-super-app` |
| `party-registry` | `app-runtime` | 4102 | `@app/party-registry` |
| `payment-term-catalog` | `app-runtime` | 4103 | `@app/payment-term-catalog` |
| `sales-inquiries` | `app-runtime` | 4109 | `@app/sales-inquiries` |
| `service-jobs` | `app-runtime` | 4110 | `@app/service-jobs` |
| `workforce` | `app-runtime` | 4111 | `@app/workforce` |
| `job-expenses` | `app-runtime` | 4112 | `@app/job-expenses` |
| `billing-documents` | `app-runtime` | 4113 | `@app/billing-documents` |
| `operations-dashboard` | `app-runtime` | 4114 | `@app/operations-dashboard` |

The application services expose container port `8080`; nginx forwards it to the delivery unit's
internal app port while each governed API keeps ownership of its CORS policy. Set `APP_ID`, `APP_PACKAGE`,
`APP_PACKAGE_DIR`, `ULTRAMODERN_SOURCE_REVISION`, and the public topology URL variables as build
arguments through ZaneOps environment variables. Runtime database, authentication, SpiceDB,
gateway, and owner API variables remain runtime configuration.

The demo public topology uses `vyklizeni-sos.web-revolution.cz` for the Shell and separate
`vyklizeni-sos-{party,payment-terms,inquiries,jobs,workforce,expenses,billing,dashboard}.web-revolution.cz`
origins for its eight browser-facing owner services. The Docker build fails when any of these demo
origins is absent; public URLs for unrelated OntOS providers fall back to the Shell origin because
those providers are outside this demo deployment.

The hosted SpiceDB endpoint is fixed to
`spicedb.vyklizeni-sos-demo.internal.zaneops:50051` and insecure transport is accepted only for
that stage-private address (or the existing Zerops stage-private address).
