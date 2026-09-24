---
title: ERP Demo Operations Dashboard
status: done
source: TASK 08 user attachment
---

# TASK 08 — ERP Demo: Provozní Dashboard

## 0. Cíl

Implementuj poslední fázi ERP dema:

```text
Dashboard / Provozní přehled
```

Dashboard má uživateli po přihlášení dát rychlou odpověď na otázky:

```text
Co právě řešíme?

Kolik máme otevřených poptávek?

Jaké zakázky jsou dnes?

Co právě probíhá?

Co nás čeká?

Které dokončené zakázky čekají na fakturaci?

Jak ekonomicky vypadají zakázky čekající na fakturaci?

Máme nějaké rozpracované faktury?

Jak vypadá pracovní plán tohoto týdne?
```

Dashboard:

* nevlastní žádná canonical business data;
* nemění žádný business stav;
* nemá Actions;
* nemá vlastní DB;
* nemá vlastní business Resource;
* pouze skládá Current reads existujících ownerů.

---

# 1. Aktuální výchozí stav

V přiloženém repository již existují minimálně tyto ERP capabilities:

```text
sales-inquiries
service-jobs
workforce
job-expenses
billing-documents
```

Jejich současné module IDs:

```text
sales.inquiries
service.jobs
workforce.planning
job.expenses
billing.documents
```

Před implementací je znovu ověř proti skutečnému workspace.

Nepředpokládej, že názvy z tohoto tasku jsou autorita, pokud se kód od vytvoření ZIPu změnil.

---

# 2. Current GitHub main

Při přípravě tohoto tasku byl:

```text
origin/main
8caa7409d7ecc2812512c844db9b1bd5008b23c9
```

Před implementací proveď:

```bash
git fetch origin
git log origin/main -1 --oneline
```

a pracuj proti skutečnému current `main`.

Synchronizuj nejnovější ERP branch s `origin/main` podle standardního repository workflow.

Nezahazuj ERP změny.

---

# 3. Povinný repository discovery

Před změnou kódu přečti:

```text
AGENTS.md
app/AGENTS.md
app/README.md
```

a relevantní current architecture:

```text
docs/PRODUCT.md
docs/contexts/ontos/CONTEXT.md

app/docs/architecture/MICROVERTICALS.md
app/docs/architecture/MODULE_ENTRYPOINTS.md
app/docs/architecture/DATA_ACCESS.md
app/docs/frontend/FRONTEND.md
```

Pak projdi skutečné current public contracts:

```text
sales-inquiries
service-jobs
workforce
job-expenses
billing-documents
```

---

# 4. Povinný duplicate audit

Než vytvoříš nový modul, prohledej celý workspace na:

```text
dashboard
overview
summary
KPI
report
reporting
analytics
home dashboard
operations dashboard
```

Zvlášť zkontroluj:

```text
app/apps/shell-super-app/src/routes/[lang]/page.tsx
app/apps/shell-super-app/src/routes/shell-frame.tsx
```

a všechny existující module reports/pages.

Cíl:

> nevytvořit druhý Dashboard, pokud po synchronizaci už existuje použitelná capability.

---

# 5. GitHub issues, které musíš respektovat

Minimálně zkontroluj current stav:

```text
#77  Create a layout for signed users
#171 Keep healthy installed modules available when one module fails
#367 Decide module criticality, fallback, revocation, and LKG rules
```

## #77

Shell už vlastní a implementuje:

```text
authenticated layout
sidebar
header
tenant selector
legal-entity selector
module navigation
account/logout menu
```

Proto:

**NEIMPLEMENTUJ NOVÝ DASHBOARD LAYOUT.**

Nepřidávej druhý:

```text
sidebar
header
navigation framework
tenant selector
legal entity selector
```

Dashboard je pouze obsah stránky uvnitř existujícího Shell layoutu.

## #171 / #367

Selhání jednoho MicroVerticalu nesmí sestřelit ostatní.

Stejná zásada platí pro Dashboard.

Například:

```text
Workforce unavailable
```

nesmí způsobit:

```text
celý Dashboard = 503
```

pokud Sales, Jobs a Billing stále fungují.

---

# 6. Architektonické rozhodnutí — vlastní malý read-only MicroVertical

Pokud duplicate audit nenajde již existující dashboard capability, vytvoř nový malý MicroVertical.

Doporučeně:

```text
appId:
operations-dashboard

moduleId:
operations.dashboard
```

Přesný název uprav podle current naming conventions.

Tento MicroVertical bude:

```text
read-only
```

a bude mít:

```text
1 stránku
1 composed governed read
0 Actions
0 Resources
0 business tables
0 migrations
0 outbox
```

---

# 7. Dashboard není System of Record

Operations Dashboard nesmí vlastnit:

```text
Inquiry
Job
Worker
Expense
Invoice
Customer
Party
Payment
```

Nevytvářej žádné tabulky typu:

```text
dashboard_metrics
dashboard_cache
dashboard_jobs
dashboard_invoices
dashboard_snapshots
kpi_values
```

Dashboard vše získává Current přes owner public contracts.

---

# 8. Dashboard nesmí být implementován v Shellu

Shell je composition/runtime boundary.

Nevkládej do:

```text
shell-super-app
```

business logiku typu:

```text
fetch inquiries
count jobs
sum expenses
read invoices
```

Shell může pouze hostovat stránku jako každý jiný MicroVertical.

Business read composition patří do:

```text
operations-dashboard
```

---

# 9. Route

Vytvoř generated page například:

```text
/dashboard
```

Navigation:

```text
Přehled
```

nebo:

```text
Dashboard
```

Pro české demo preferuj:

```text
Přehled
```

Title:

```text
Provozní přehled
```

---

# 10. Domovská Shell stránka

Aktuální `/` je Shell-owned stránka s identity/context informacemi.

Nepřepisuj ji natvrdo Dashboardem.

Pokud current `main` po synchronizaci nabízí obecný podporovaný mechanismus:

```text
default landing page contribution
```

lze Dashboard nastavit jako landing page.

Pokud takový generic contract neexistuje:

**nepřidávej dashboard-specific hardcoding do Shellu.**

Dashboard zůstane jako první/viditelná položka:

```text
Přehled
```

v navigaci.

---

# 11. Povinný Astra pre-review

Ještě před implementací dej Astře:

* tento TASK;
* current repo;
* všechny ERP public reads;
* Shell architecture;
* #77;
* #171;
* #367.

Prompt:

> Review the proposed final ERP Operations Dashboard against the current OntOS repository.
>
> Find duplication first.
>
> The Dashboard must be a read-only composition over existing ERP owners.
>
> Check especially:
>
> 1. whether an existing Dashboard/reporting capability already exists;
> 2. whether Shell already owns layout/navigation that must be reused;
> 3. whether Dashboard is incorrectly becoming a System of Record;
> 4. whether any proposed metric duplicates an owner calculation;
> 5. whether Job Economics already provides cost/margin calculations;
> 6. whether Billing already provides Invoiceable Jobs;
> 7. whether Jobs already provide TODAY/UPCOMING/IN_PROGRESS semantics;
> 8. whether Workforce already provides Weekly Schedule;
> 9. whether a dependency outage incorrectly takes down the whole Dashboard;
> 10. whether creating a new database, Action or Resource is unnecessary;
> 11. whether any KPI would be misleading because the source read is paginated or incomplete;
> 12. whether the whole solution can be reduced further.
>
> Separate blockers from optional improvements.

Implementuj pouze po vyřešení blockers.

---

# 12. Použij pouze existující owner calculations

Toto je zásadní.

Dashboard nesmí znovu implementovat business calculations, které už existují.

---

# 13. Poptávky — použij Inquiry List

Existuje:

```text
InquiryList
```

z:

```text
sales.inquiries
```

Aktuální stage:

```text
NEW
SITE_VISIT
PRICING
OFFER_SENT
ACCEPTED
DECLINED
```

Dashboard z něj může odvodit jednoduchý presentation summary:

```text
Otevřené poptávky
```

definované jako:

```text
NEW
+
SITE_VISIT
+
PRICING
+
OFFER_SENT
```

Může zobrazit rozpad:

```text
Nové
Prohlídka
Nacenění
Nabídka odeslána
```

Nepřidávej nový Inquiry status ani tabulku statistik.

---

# 14. Inquiry count může být přesný

Current:

```text
InquiryList
```

není v demo contractu paginovaný.

Pokud to po synchronizaci stále platí:

Dashboard může bezpečně zobrazit exact count.

Pokud se contract změnil na paginated:

musíš změnit dashboard semantics a nepředstírat exact total z jedné stránky.

---

# 15. Zakázky — znovu použij owner views

Current `JobList` již podporuje:

```text
ALL
TODAY
UPCOMING
IN_PROGRESS
COMPLETED
```

Proto Dashboard nesmí sám počítat:

```text
scheduledStartAt >= now
```

a vytvářet vlastní význam „Upcoming“.

Použij owner view:

```text
TODAY
UPCOMING
IN_PROGRESS
```

---

# 16. Dashboard Job queries

Doporučeně načti:

```text
TODAY
IN_PROGRESS
UPCOMING
```

s bounded:

```text
pageSize
```

například:

```text
100
```

pro count semantics a z každého výsledku zobraz maximálně:

```text
5
```

preview položek.

---

# 17. Paginated count nesmí lhát

`JobList` vrací:

```text
nextCursor
```

Proto pokud:

```text
nextCursor == none/null
```

count může být:

```text
3
```

Pokud:

```text
items.length == 100
nextCursor exists
```

Dashboard nesmí tvrdit:

```text
100 zakázek
```

jako exact total.

Místo toho reprezentuj:

```text
100+
```

nebo view model:

```text
count = 100
exact = false
```

UI:

```text
100+
```

---

# 18. Workforce — použij Weekly Schedule

Current Workforce již má:

```text
WeeklySchedule
```

Nevytvářej vlastní:

```text
Crew schedule
Worker calendar
Job-worker join
```

v Dashboardu.

---

# 19. Current week

Dashboard request může obsahovat pouze presentation input:

```text
weekStart
```

ve formátu používaném Workforce.

Frontend vypočte pondělí aktuálního lokálního týdne.

To není canonical business mutation, pouze volba read window.

Příklad:

```text
2026-10-05
```

---

# 20. Workforce public client export

V aktuálním snapshotu existuje:

```text
weekly-schedule-client.ts
```

ale ověř, zda je:

```text
executeWeeklyScheduleWithAuthorization
```

skutečně exportováno přes veřejný:

```text
@app/workforce/api/client
```

Pokud ano:

použij jej.

Pokud ne:

smíš udělat **pouze minimální public barrel export existujícího generated clientu**.

Nevytvářej:

```text
nový Weekly Schedule API
nový schedule model
nový Workforce read
```

jen kvůli Dashboardu.

---

# 21. Billing — použij Invoiceable Jobs

Billing již má:

```text
InvoiceableJobs
```

Tento owner už řeší:

```text
COMPLETED Jobs
-
Jobs already having Invoice
```

Proto Dashboard nesmí implementovat:

```text
if job.status == COMPLETED && !invoiceExists(...)
```

sám.

Použij:

```text
InvoiceableJobs
```

---

# 22. Billing queue

Dashboard zobrazí:

```text
Čeká na fakturaci
```

z:

```text
InvoiceableJobs
```

Opět respektuj pagination.

Preview například:

```text
max 5 Jobs
```

---

# 23. Rozpracované faktury

Billing již má:

```text
InvoiceList
```

s:

```text
status = DRAFT
status = ISSUED
```

Dashboard použije:

```text
InvoiceList(status = DRAFT)
```

pro:

```text
Rozpracované faktury
```

---

# 24. Vystavené faktury

Použij:

```text
InvoiceList(status = ISSUED)
```

pro jednoduchý preview:

```text
Vystavené faktury
```

Nevytvářej:

```text
Revenue Ledger
Accounts Receivable
Payment dashboard
```

---

# 25. NEIMPLEMENTUJ měsíční obrat

Pro tento demo Dashboard nepřidávej KPI:

```text
Obrat tento měsíc
Roční obrat
Cashflow
Pohledávky
```

pokud neexistuje owner contract, který tuto business metriku skutečně definuje.

Sečíst první stránku InvoiceList není obrat.

---

# 26. Job Economics — maximálně znovu využít

Current `job-expenses` už má:

```text
JobEconomics
```

který vlastní/vrací:

```text
agreedPriceCzk
recordedCostTotal
differenceCzk
marginPercent
categoryTotals
comparisonReason
```

Dashboard NESMÍ znovu počítat:

```text
price - costs
```

ani:

```text
margin %
```

---

# 27. Economics panel

Pro maximálně:

```text
5
```

Jobs z:

```text
InvoiceableJobs
```

zavolej:

```text
JobEconomics
```

a zobraz například:

```text
Zakázka Ostrava

Cena:      20 000 Kč
Náklady:    8 200 Kč
Rozdíl:    11 800 Kč
Marže:       59 %
```

Pouze pokud owner vrátí comparable result.

---

# 28. comparisonReason

Pokud `JobEconomics` vrátí například:

```text
NO_RECORDED_COSTS
PRICE_BASIS_NOT_COMPARABLE
ZERO_AGREED_PRICE
```

Dashboard nesmí dopočítat vlastní margin.

Zobraz pouze dostupná fakta.

Například:

```text
Cena: 20 000 Kč
Náklady: —
Marže: nelze určit
```

---

# 29. N+1 musí být omezené

Nevolej:

```text
JobEconomics
```

pro stovky Jobs.

Economics enrichment pouze pro:

```text
max 5
```

invoiceable preview položek.

Maximum musí být explicitní v kódu.

---

# 30. Fleet

Aktuální přiložený repo snapshot nemá:

```text
fleet
```

MicroVertical.

Proto poslední fáze:

**NESMÍ vytvářet Fleet placeholder business data.**

Nepřidávej:

```text
vehiclesToday
availableVehicles
vehicleUtilization
```

dokud Fleet capability skutečně neexistuje.

Pokud po synchronizaci mezitím Fleet vznikl:

nejdřív proveď nový duplicate/owner review, než jej zahrneš.

---

# 31. Dashboard Overview API

Vytvoř jeden owner read například:

```text
DashboardOverview
```

Request minimálně:

```text
weekStart
```

Nepřidávej generic query builder.

Nepřidávej arbitrary:

```text
metrics[]
filters[]
groupBy
formula
```

---

# 32. Dashboard nemá Action

Explicitně:

```text
0 Dashboard Actions
```

Dashboard není workflow engine.

Tlačítka typu:

```text
Otevřít zakázku
Otevřít faktury
```

jsou pouze navigační odkazy.

---

# 33. Dashboard nemá Resource

Nevytvářej:

```text
Dashboard Resource
KPI Resource
Metric Resource
Widget Resource
```

Není pro ně durable business identity.

---

# 34. Dashboard nemá DB

Pokud Codesmith vytvoření module contractu nevyžaduje DB:

nepřidávej PostgreSQL schema.

Pokud scaffolding vytvoří nepotřebnou DB vrstvu:

ověř current generator conventions a odstraň ji pouze podporovaným způsobem.

DoD:

```text
operations-dashboard nemá canonical persistence.
```

---

# 35. Dashboard response má být vlastní presentation DTO

Nevracej browseru přímo celý součet několika owner aggregates.

V Dashboard MicroVertical vytvoř minimální read model.

Conceptuálně:

```text
DashboardOverview {
  generatedAt

  inquiries
  jobs
  workforce
  billing
  economics
}
```

---

# 36. Common section state

Každá nezávislá sekce má explicitní stav.

Například:

```text
READY
UNAVAILABLE
HIDDEN
```

Význam:

```text
READY
→ data jsou dostupná

UNAVAILABLE
→ transient/provider failure

HIDDEN
→ aktuální user/context nemá bezpečně použitelný owner read
```

Nevytvářej:

```text
STALE
```

pokud nemáš owner-issued stale data.

---

# 37. Žádný LKG Dashboard

#367 explicitně odmítá automatic persistent last-known-good fallback.

Proto:

* nepersistuj minulý Dashboard;
* neukazuj včerejší data jako Current;
* nepřidávej Redis/cache DB jen kvůli dostupnosti.

Pokud provider nejde:

```text
Sekce je dočasně nedostupná
```

---

# 38. Partial failure je povinná

Příklad:

```text
Sales       READY
Jobs        READY
Workforce   UNAVAILABLE
Billing     READY
Expenses    READY
```

Výsledek:

```text
Dashboard se zobrazí.
```

Pouze Workforce panel ukáže:

```text
Pracovní plán je dočasně nedostupný.
```

---

# 39. Kdy může failnout celý Dashboard read

Celý request může failnout například při:

```text
Dashboard authentication failure
Dashboard authorization failure
invalid trusted Tenant context
invalid/missing required Legal Entity context
broken Dashboard module runtime
```

Ne při obyčejném výpadku jednoho consumer dependency.

---

# 40. Dependency authorization

Použij současný bezpečný cross-MicroVertical pattern.

Prostuduj zejména:

```text
job-expenses/src/services/jobs-read.service.ts

billing-documents/src/services/owner-readers.service.ts
```

Dashboard bude potřebovat více nezávislých downstream owner calls.

Proto preferuj současný pattern, který umí pro každý downstream audience získat samostatný bounded credential.

---

# 41. Neobcházej credential boundary

Zakázáno:

```text
raw fetch bez generated clientu
reuse jednoho bearer tokenu na několik audiences
předávání browser cookies providerům
private DB access
private service import
```

---

# 42. Nejprve hledej existující generic helper

Před vytvořením Dashboard-specific credential service prohledej:

```text
gateway-principal-verifier
shared-contracts
core-runtime
existing vertical integrations
```

Pokud existuje generic reusable issuer:

použij jej.

Pokud ne:

vytvoř pouze minimální module-local credential service podle current Billing pattern.

**NEREFAKTORUJ celý repository pouze kvůli odstranění podobnosti jednoho 50řádkového adapteru.**

---

# 43. Dependency clients

Preferuj existující veřejné generated clients.

Aktuální snapshot má například:

```text
executeInquiryListWithAuthorization

executeJobListWithAuthorization

executeInvoiceableJobsWithAuthorization
executeInvoiceListWithAuthorization

executeJobEconomicsWithAuthorization
```

Workforce analog ověř podle bodu výše.

---

# 44. Žádné private cross-MicroVertical imports

Povoleny jsou pouze public contract/client exports.

Zakázáno:

```text
@app/.../src/services/...
@app/.../src/persistence/...
@app/.../vertical.registration
```

jiného MicroVerticalu.

---

# 45. Dashboard KPI cards

Doporučené horní cards:

```text
Otevřené poptávky

Zakázky dnes

Právě probíhá

Čeká na fakturaci

Koncepty faktur
```

To je pro demo dostatečné.

---

# 46. Otevřené poptávky

Exact hodnota:

```text
NEW
+ SITE_VISIT
+ PRICING
+ OFFER_SENT
```

Kliknutí:

```text
/inquiries
```

---

# 47. Zakázky dnes

Použij:

```text
JobList view=TODAY
```

Ne vlastní date filtering.

Kliknutí:

```text
/jobs
```

---

# 48. Probíhající zakázky

Použij:

```text
JobList view=IN_PROGRESS
```

---

# 49. Čeká na fakturaci

Použij:

```text
InvoiceableJobs
```

Ne kombinaci Jobs + InvoiceList.

---

# 50. Koncepty faktur

Použij:

```text
InvoiceList status=DRAFT
```

---

# 51. Card count contract

Pro paginated owner result vytvoř například:

```text
{
  count: 5,
  exact: true
}
```

nebo:

```text
{
  count: 100,
  exact: false
}
```

UI:

```text
5
```

vs.

```text
100+
```

Nikdy neprezentuj lower bound jako exact total.

---

# 52. Dnešní zakázky panel

Pod cards zobraz preview:

```text
Dnešní zakázky
```

Max:

```text
5
```

položek.

Například:

```text
08:00
Vyklizení bytu — Ostrava
PLANNED

13:00
Vyklizení domu — Havířov
IN_PROGRESS
```

---

# 53. Používej owner Job data

Nevytvářej vlastní Dashboard Job DTO s duplicitní business semantics.

Presentation DTO má pouze bezpečné display fields, například:

```text
jobRef
scheduledStartAt
status
city
short description
```

Je to transient read projection.

---

# 54. Upcoming panel

Pokud UI zůstane přehledné, přidej:

```text
Nadcházející zakázky
```

z:

```text
JobList view=UPCOMING
```

Max:

```text
5
```

Pokud by Dashboard byl příliš dlouhý:

prioritu má Today's Jobs + Invoice Queue.

---

# 55. Workforce panel

Zobraz:

```text
Plán tohoto týdne
```

z:

```text
WeeklySchedule
```

Neimplementuj druhý calendar.

---

# 56. Workforce preview

Maximálně:

```text
7
```

nejbližších naplánovaných Jobs.

Zobraz:

```text
čas
job
crew
```

Například:

```text
Pondělí 08:00
Ostrava
Petr Novák, Jan Svoboda
```

---

# 57. Workforce conflict

Pokud existing Workforce view označuje některého Workera:

```text
JOB_CONFLICT
```

Dashboard může zobrazit warning:

```text
⚠ konflikt posádky
```

Nevytvářej vlastní conflict calculation.

---

# 58. K fakturaci + ekonomika

Panel:

```text
K fakturaci
```

pro každou preview Job:

```text
Zakázka
Accepted cena
Recorded costs
Rozdíl
Marže
```

Values vezmi pouze z:

```text
JobEconomics
```

---

# 59. Economics partial failure

Pokud:

```text
Billing READY
Expenses UNAVAILABLE
```

stále ukaž:

```text
Job čeká na fakturaci
```

ale economics část:

```text
Ekonomika dočasně nedostupná
```

---

# 60. Vystavené faktury panel

Jednoduchý preview:

```text
Vystavené faktury
```

max:

```text
5
```

fields:

```text
invoiceNumber
customerDisplayName
total
issuedAt
dueAt
```

Nezobrazuj payment status.

---

# 61. Dashboard neřeší overdue lifecycle

Může pouze zobrazit:

```text
dueAt
```

Nedělej Dashboard status:

```text
OVERDUE
```

pokud Billing/Receivables tento semantic outcome nevlastní.

---

# 62. Žádné grafy v první verzi

Neinstaluj chart library.

Nepřidávej:

```text
line chart
pie chart
bar chart
revenue chart
```

Dashboard pro demo bude rychlejší, jasnější a stabilnější jako:

```text
cards + lists
```

Pokud se později prokáže potřeba analytiky, řeší se samostatně.

---

# 63. Žádné časové analytické agregace

TASK 08 neimplementuje:

```text
monthly revenue
annual revenue
conversion rate history
average job margin by month
employee utilization
expense trends
```

Tyto metrics potřebují explicitní reporting semantics.

---

# 64. Co Dashboard naopak může bezpečně zobrazit

Current operational facts:

```text
kolik inquiry records je právě v jednotlivých stages

které Jobs owner označuje jako TODAY

které Jobs jsou IN_PROGRESS

které Jobs jsou UPCOMING

které Completed Jobs Billing označuje jako invoiceable

které invoices jsou DRAFT

které invoices jsou ISSUED

jak vypadá Workforce WeeklySchedule

jaké JobEconomics owner vrací pro konkrétní Jobs
```

---

# 65. Refresh

Dashboard má mít jednoduché:

```text
Obnovit
```

které znovu načte Current reads.

Nepřidávej:

```text
WebSockets
live subscriptions
polling every 5 seconds
```

---

# 66. Automatický refresh

Pro demo není nutný.

Pokud current TanStack pattern automaticky revaliduje při navigation/focus:

využij jej.

Nevytvářej vlastní polling infrastructure.

---

# 67. UI struktura

Doporučené pořadí:

```text
Provozní přehled

[KPI cards]

Dnešní zakázky

K fakturaci
+ ekonomika

Plán tohoto týdne

Rozpracované faktury

Vystavené faktury
```

---

# 68. Mobile

Na mobilu:

```text
cards
↓
sekce
↓
list items
```

Jednosloupcově.

Žádná horizontální tabulka přes celý Dashboard.

---

# 69. Desktop

Desktop může mít:

```text
KPI grid

2-column sections
```

ale ne za cenu duplicity komponent.

Použij current UI kit.

---

# 70. Navigation links

Každá sekce může mít:

```text
Zobrazit vše
```

směřující na existující stránky:

```text
/inquiries
/jobs
/workforce
/expenses
/invoices
```

Dashboard nesmí vytvářet duplicitní CRUD.

---

# 71. Dashboard neumí editovat data

Na Dashboardu nebude:

```text
Edit Job
Create Invoice Draft form
Assign Worker form
Record Expense
Edit Inquiry
```

Pouze navigace na owning module.

---

# 72. Response sanitization

Dashboard public response obsahuje pouze safe display fields.

Nepropaguj automaticky:

```text
internal notes
audit evidence
dependency credentials
raw provider payloads
hidden identifiers
```

jen proto, že je owner read vrátil.

---

# 73. Legal Entity scope

Dashboard musí respektovat Current:

```text
Tenant
+
Legal Entity
```

Každý downstream owner call musí používat tentýž trusted scope.

Dashboard nesmí skládat data:

```text
Legal Entity A
+
Legal Entity B
```

v jednom overview.

---

# 74. Cross-Tenant

Jakýkoli downstream result s jiným Tenant/Legal Entity scope:

```text
fail closed pro danou section / operation
```

podle existin
