#!/usr/bin/env bash
set -Eeuo pipefail

pnpm db:migrate
node scripts/initialize-hosted-demo.mts
node deploy/zane/migrator-ready.mjs
