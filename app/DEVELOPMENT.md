# Development

## Local ERP demo

On Windows, launch `Spustit ERP Demo.exe` from the repository root, or run
`powershell -ExecutionPolicy Bypass -File app/scripts/start-erp-demo.ps1` from that directory.
Docker Desktop and mise must be installed. The launcher installs dependencies, prepares the local
environment, runs migrations and `local:initialize`, then provisions current Action authorization.
It starts the ERP modules, Shell and Party Registry outbox worker (readiness on port 4122), initializes
the billing default and runs `local:initialize:erp-demo` before opening the browser.

Open <http://localhost:3020> and log in with `demo@test.com` / `password1234`.
Initialization is repeatable: it reuses **Jan Novák - Demo zákazník** and **Petr Dvořák**, an active
employee with an open-ended employment agreement from 2020-01-01. The customer is created and reviewed
through Party Registry Actions without inventing an official identifier. Bootstrap waits for the
real search projection. Worker creation also uses its public Action client. No business rows are
inserted directly and assignment/workflow validation remains enabled.

UI walkthrough (Czech):

1. **Poptávky a nabídky → Nová poptávka**. Search for `Jan Novák`, select the demo customer,
   fill street, city and postal code, then **Uložit poptávku**.
2. **Přejít k nacenění**, choose **Zadaná cena → Cena včetně DPH**, fill offer amounts, **Uložit kalkulaci** and
   **Označit nabídku jako odeslanou**.
3. Record the acceptance method and confirmation note, then **Přijata**.
4. **Založit zakázku**, then select the accepted offer on the Jobs page.
5. Fill **Plánovaný začátek** (Prague time) and **Odhad délky (minuty)**, then **Uložit termín**.
6. **Tým a plánování → Harmonogram**. Select the week containing that date,
   **Upravit posádku → Petr Dvořák → Přiřadit**.
7. Return to **Zakázky**, open the job, **Zahájit zakázku**, then **Dokončit zakázku**.
8. **Výdaje → Otevřít ekonomiku → Přidat náklad**. Choose a category, description, date and amount
   (for example `1250,00`), then **Uložit náklad**. Reload and reopen the job to verify persistence.
9. **Přehled firmy (Dashboard) → K fakturaci a ekonomika** shows the completed job and its recorded costs.
10. **Faktury → Nová faktura**, find that job and **Uložit koncept**. Select **Jednorázová fakturační
    adresa**, fill the address, a recognizable **Popis**, and choose **Splatnost 14 dní**, then
    **Uložit změny → Vystavit fakturu**.
11. Reload the invoice list and reopen the invoice; its number and totals remain saved. On **Přehled firmy**,
    it appears under **Vystavené faktury** and the job leaves the invoiceable list.

The current billing workflow can issue accepted prices **including VAT**. Prices excluding VAT still
require an authoritative tax calculation, which this demo does not implement. Gross offer prices and
net recorded costs are intentionally not shown as a comparable margin; the costs themselves remain visible.
Dashboard previews are bounded lists, so older entries may require opening their owning module.
The normal migration step also installs Payment Term Catalog's durable assertion replay store, needed
to read the payment terms over HTTP. Business tables retain their existing access policies.

For an already running local stack, `mise exec -- pnpm local:initialize:erp-demo` only ensures the
customer/search projection and worker. It expects the base local context and Action provisioning
to be ready. It uses the local gateway API key created by `local:initialize` and the same
`ONTOS_*_API_URL` settings as the launcher; non-loopback service URLs are rejected.
`ONTOS_SHELL_GATEWAY_BASE_URL` includes the API prefix: `http://localhost:3020/shell-super-app-api`.
Billing and Dashboard use that same URL to obtain audience-specific credentials. After updating an
already running Windows demo, stop and restart it so existing processes receive the corrected setting.
Use `app/scripts/stop-erp-demo.ps1` to stop the launcher processes; databases remain available.

The browser smoke test expects a freshly initialized disposable demo stack. From `app/`, run:

```sh
mise exec -- pnpm --filter @app/shell-super-app exec playwright test --config playwright-erp-demo.config.ts
```

It signs in and performs the full flow through visible controls, including reload checks for
assignment, completion, a recorded expense and an issued invoice, plus Dashboard updates before and
after invoicing. It leaves its demo records in the database and uses the fixture interval
2026-11-09 13:00–15:00 Prague time. For repeated runs, use a fresh demo DB to avoid a legitimate
worker scheduling conflict. Screenshots are saved under Shell's
`test-results/`. Chromium must be installed for Playwright (`pnpm --filter @app/shell-super-app exec
playwright install chromium`).

## Branches

`main` is the canonical development branch and the default base and pull-request target. Do not start new work from `develop`; it exists only for the one-time transition back to `main` and may be removed after that transition.

Promote releases from `main` to the protected `stage` branch. Feature sandboxes start from the current committed `main` workflow below.

## Repository-managed tooling

- `.mise.toml` and `package.json#packageManager` own the local Node and pnpm toolchain.
- `package.json#scripts` owns command names and composition.
- `.agents/skills-lock.json` owns tracked skill sources; `.codex/skills/` is generated local output.
- Read-only reference repositories are opt-in through `mise exec -- pnpm agents:refs:install`.

Do not copy versions, current package inventory, or generated skill state into prose.

## Locki

[Locki](https://github.com/JanPokorny/locki) creates isolated development sandboxes backed by Git worktrees and containers. Each feature gets its own branch, dependencies, services, database, and AI session without changing the primary checkout.

Install Locki globally; the current directory does not matter:

```sh
uv tool install locki
```

Run the one-time setup to select the AI harness and editor:

```sh
locki setup
```

Do not copy the entire `~/.codex` directory when prompted; it can contain large Codex worktrees. Authenticate the selected harness inside Locki when required.

## Feature sandbox workflow

Create and prepare a sandbox from `main` while in the primary `app/` directory:

```sh
mise exec -- pnpm sandbox:new -- customer-search
```

Replace `customer-search` with the feature slug. The command creates the branch and worktree, copies `app/.env`, installs dependencies, starts containers, runs Drizzle migrations, initializes the local tenant, legal entity, user, and Party Registry MicroVertical, verifies the database, and opens the configured AI harness. Record the printed sandbox ID.

Forward application ports from macOS to the sandbox:

```sh
locki pf --match 1aixi9oo 3020 4102
```

Replace `1aixi9oo` with the sandbox ID. The command returns immediately.

Enter the sandbox and run OntOS in another terminal:

```sh
locki x --match 1aixi9oo
cd app
mise exec -- pnpm dev
```

`pnpm dev` occupies that terminal until stopped.

Party Registry owns Contacts, counterparties, and engagement profiles in one MicroVertical. Start the Shell and Party Registry processes before exercising engagement-profile writes; there is no separate Contacts deployment or cross-MicroVertical validation call. `mise exec -- pnpm env:local:ensure` materializes the shared local infrastructure values while preserving explicit values and printing no secrets.

### Fail-closed Action authorization checkpoint

Sandbox preparation creates the fixed development context and Tenant membership but does not provision Action executor relationships. For authorization changes, keep one sandbox unchanged and verify this order:

1. invoke a representative Party Registry engagement mutation as `demo@test.com`;
2. confirm a localized error Toast and `403`, one rejected invocation/audit record, and no business write or handler effect;
3. run `mise exec -- pnpm authorization:provision-current-actions` twice to prove idempotence;
4. retry the mutation and confirm normal success without a denial Toast;
5. confirm a Principal outside the fixed development Tenant remains denied.

The provisioning command discovers current Actions and grants executor relations only to the fixed development Tenant membership set. It accepts no caller-supplied scope and never writes stage from a development sandbox.

When the feature sandbox is no longer needed, stop its running processes and remove it:

```sh
locki rm --match 1aixi9oo --branches
```

Locki refuses removal when uncommitted changes exist. This removes the container, worktree, port forwards, and sandbox branches.

Delete the shared Locki VM only when its containers, images, volumes, and caches are no longer needed:

```sh
locki vm delete
```

Host-side worktrees and the shared sandbox home remain.

## Prepared environment

- Login: `demo@test.com`
- Password: `password1234`
- Tenant: `Techsio`
- Legal entity: `TechsioCZ`
