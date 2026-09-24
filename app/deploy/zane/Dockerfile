FROM authzed/spicedb:v1.56.0 AS spicedb

FROM node:26.7.0-bookworm-slim AS workspace

ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH

RUN npm install --global pnpm@12.4.2

WORKDIR /workspace/app
COPY . .
RUN --mount=type=cache,id=ontos-zane-pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --config.enable-global-virtual-store=false

FROM workspace AS app-builder

ARG APP_ID
ARG APP_PACKAGE
ARG APP_PACKAGE_DIR
ARG ULTRAMODERN_SOURCE_REVISION
ARG ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP
ARG ULTRAMODERN_PUBLIC_URL_PARTY_REGISTRY
ARG ULTRAMODERN_PUBLIC_URL_PAYMENT_TERM_CATALOG
ARG ULTRAMODERN_PUBLIC_URL_SALES_INQUIRIES
ARG ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS
ARG ULTRAMODERN_PUBLIC_URL_WORKFORCE
ARG ULTRAMODERN_PUBLIC_URL_JOB_EXPENSES
ARG ULTRAMODERN_PUBLIC_URL_BILLING_DOCUMENTS
ARG ULTRAMODERN_PUBLIC_URL_OPERATIONS_DASHBOARD

ENV ULTRAMODERN_DEPLOYMENT_ENVIRONMENT=stage
ENV ULTRAMODERN_SOURCE_REVISION=$ULTRAMODERN_SOURCE_REVISION
ENV ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP=$ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP
ENV MODERN_PUBLIC_SITE_URL=$ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP
ENV ULTRAMODERN_MF_DEV_ORIGIN=$ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP
ENV ULTRAMODERN_PUBLIC_URL_PARTY_REGISTRY=$ULTRAMODERN_PUBLIC_URL_PARTY_REGISTRY
ENV ULTRAMODERN_PUBLIC_URL_PAYMENT_TERM_CATALOG=$ULTRAMODERN_PUBLIC_URL_PAYMENT_TERM_CATALOG
ENV ULTRAMODERN_PUBLIC_URL_SALES_INQUIRIES=$ULTRAMODERN_PUBLIC_URL_SALES_INQUIRIES
ENV ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS=$ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS
ENV ULTRAMODERN_PUBLIC_URL_WORKFORCE=$ULTRAMODERN_PUBLIC_URL_WORKFORCE
ENV ULTRAMODERN_PUBLIC_URL_JOB_EXPENSES=$ULTRAMODERN_PUBLIC_URL_JOB_EXPENSES
ENV ULTRAMODERN_PUBLIC_URL_BILLING_DOCUMENTS=$ULTRAMODERN_PUBLIC_URL_BILLING_DOCUMENTS
ENV ULTRAMODERN_PUBLIC_URL_OPERATIONS_DASHBOARD=$ULTRAMODERN_PUBLIC_URL_OPERATIONS_DASHBOARD

SHELL ["/bin/bash", "-c"]
RUN test -n "$APP_ID" \
  && test -n "$APP_PACKAGE" \
  && test -n "$APP_PACKAGE_DIR" \
  && test -n "$ULTRAMODERN_SOURCE_REVISION" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_PARTY_REGISTRY" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_PAYMENT_TERM_CATALOG" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_SALES_INQUIRIES" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_SERVICE_JOBS" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_WORKFORCE" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_JOB_EXPENSES" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_BILLING_DOCUMENTS" \
  && test -n "$ULTRAMODERN_PUBLIC_URL_OPERATIONS_DASHBOARD" \
  && while IFS= read -r public_url_variable; do \
       if [[ -n "$public_url_variable" && -z "${!public_url_variable:-}" ]]; then \
         export "$public_url_variable=$ULTRAMODERN_PUBLIC_URL_SHELL_SUPER_APP"; \
       fi; \
     done < <(node --input-type=module -e "import topology from './topology/reference-topology.json' with { type: 'json' }; for (const vertical of topology.verticals) { const key = vertical.cloudflare?.publicUrlEnv; if (typeof key === 'string') console.log(key); }") \
  && NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter "$APP_PACKAGE" run build \
  && pnpm run zerops:materialize --app "$APP_ID" --package "$APP_PACKAGE" --package-dir "$APP_PACKAGE_DIR"

FROM node:26.7.0-bookworm-slim AS app-runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends gettext-base nginx tini \
  && rm -rf /var/lib/apt/lists/*

ARG APP_ID
WORKDIR /srv/ontos
COPY --from=app-builder /workspace/app/.zerops/runtime/${APP_ID}/ ./
COPY deploy/zane/runtime-nginx.conf.template /etc/nginx/templates/ontos.conf.template
COPY --chmod=755 deploy/zane/start-app-runtime.sh /usr/local/bin/start-ontos-app

EXPOSE 8080
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/start-ontos-app"]

FROM workspace AS migrator

ENV MIGRATOR_PORT=8080
EXPOSE 8080
CMD ["bash", "deploy/zane/start-migrator.sh"]

FROM node:26.7.0-bookworm-slim AS spicedb-runtime

RUN apt-get update \
  && apt-get install --yes --no-install-recommends ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=spicedb /usr/local/bin/spicedb /usr/local/bin/spicedb
COPY packages/core-runtime/spicedb/bootstrap.yaml /bootstrap/bootstrap.yaml
COPY --chmod=755 deploy/zane/start-spicedb.sh /usr/local/bin/start-ontos-spicedb

EXPOSE 50051 8443
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/start-ontos-spicedb"]
