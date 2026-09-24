---
title: ERP Demo Billing Documents
status: done
source: TASK 07 user attachment
---

# TASK 07 — ERP Demo: Fakturace / Billing Documents

## 0. Cíl

Pracuješ v repository:

`TechsioCZ/ontos`

Stavíme jednoduché demonstrační ERP pro firmu zabývající se vyklízením bytů a domů.

Dosavadní ERP flow je:

```text
Kontakt / zákazník
        ↓
Poptávka
        ↓
Nabídka
        ↓
Přijatá nabídka
        ↓
Zakázka
        ↓
Naplánovaná
        ↓
Probíhá
        ↓
Dokončená
        ↓
FÁZE 07
Faktura
```

TASK 07 má dodat:

```text
Dokončená zakázka
        ↓
Koncept faktury
        ↓
Kontrola odběratele
        ↓
Platební podmínka
        ↓
Vystavit
        ↓
Faktura s číslem a splatností
```

Cílem je **jednoduchá provozní fakturace pro demo**.

Není cílem vytvořit:

- účetnictví;
- daňový systém;
- pohledávky;
- bankovní párování;
- Payment modul;
- Documents Center;
- kompletní český účetní software.

---

# 1. KRITICKÉ — nejdříve zjisti skutečnou výchozí větev

Přiložený repo snapshot obsahuje:

```text
HEAD:
Pavel_Siampark
→ f9ae9214230e1745dda84db957eb171c9ddb7632
```

ale tato větev není nejnovější ERP implementace.

V lokálním Git repu byly při přípravě tohoto tasku nalezeny minimálně:

```text
codex/erp-demo-inquiries
→ 080b89c...

codex/erp-demo-service-jobs
→ a526da4...

codex/erp-demo-workforce
→ 4005e11...

codex/erp-demo-job-expenses
→ 4005e11...
```

To znamená:

```text
job-expenses ref
==
workforce ref
```

v přiloženém stavu.

TASK 06 tedy v tomto snapshotu nemá vlastní nový commit.

## Před implementací

Proveď:

```bash
git status
git branch --all --verbose
git log --graph --decorate --oneline --all
```

a zjisti nejnovější skutečný ERP commit.

**Nezačínej TASK 07 automaticky z aktuálně checkoutnuté `Pavel_Siampark`.**

Jako výchozí základ použij nejnovější větev obsahující všechny skutečně dokončené ERP fáze.

Pokud od vytvoření archivu vznikl novější lokální commit TASK 05/06, použij jej.

Nikdy:

- nemaž uncommitted práci;
- nepřepisuj branch force operací;
- nezahoď novější lokální fáze.

---

# 2. Synchronizace proti aktuálnímu GitHub main

V okamžiku přípravy tohoto tasku byl current GitHub:

```text
main
→ 8caa7409d7ecc2812512c844db9b1bd5008b23c9
```

ale před implementací znovu fetchni remote a ověř aktuální stav.

```bash
git fetch origin
git log origin/main -1
```

Přenes latest ERP branch na aktuální `origin/main` standardním bezpečným repository workflow.

Vyřeš případné konflikty podle:

1. aktuálního `main`;
2. current ADR/context authority;
3. skutečné ERP business funkcionality.

Nenechávej staré scaffolding/API patterns jen proto, že existují v ERP branchi.

Aktuální `main` má proti staršímu ERP základu nové capabilities a tooling, které mají být znovu použity.

---

# 3. Povinný repository discovery

Před změnou kódu přečti relevantní current authority podle `AGENTS.md`.

Minimálně:

```text
AGENTS.md
app/AGENTS.md
app/README.md

docs/PRODUCT.md
docs/contexts/ontos/CONTEXT.md

app/docs/architecture/MICROVERTICALS.md
app/docs/architecture/ACTIONS.md
app/docs/architecture/DATA_ACCESS.md
app/docs/architecture/MODULE_ENTRYPOINTS.md
app/docs/frontend/FRONTEND.md
app/docs/architecture/PARTY_REGISTRY.md
```

A skutečný kód:

```text
sales-inquiries
service-jobs
workforce
```

plus případné novější ERP capabilities, které existují v aktuálním branchi.

---

# 4. Povinný duplicate audit

Než vytvoříš jediný nový business artifact, prohledej celý aktuální workspace i current `main` na:

```text
billing
billing document
invoice
invoice recipient
invoice number
payment term
due date
receivable
credit note
Party BILLING address
official identifier
ServiceJob
commercialSummary
```

Sepiš krátkou interní matici:

```text
Capability
Existing owner
Can reuse?
Action for TASK 07
```

Cíl:

> TASK 07 nesmí vytvořit druhého ownera funkce, kterou OntOS již má.

---

# 5. Povinné GitHub issue porovnání

Znovu načti current bodies minimálně:

```text
#253 COMMERCE_MODULE_CATALOG_AND_SEQUENCE
#335 P2_PAYMENT_TERM_CATALOG
#342 INVOICE_RECIPIENT_RESOLUTION
#214 BILLING
#179 PARTY_REGISTRY
```

Relevantní rozhodnutí:

## #253

Billing Documents vlastní conceptuálně:

```text
invoice
advance invoice
credit/corrective document
numbering
Accepted Invoice Recipient Snapshot
Accepted Payment Term Snapshot
finance-owned correction rules
```

TASK 07 ale implementuje pouze nejmenší potřebný podmnožinový demo scope:

```text
INVOICE
```

Nepřitahuj dopředu:

```text
advance invoices
credit notes
corrective documents
receivables
```

---

# 6. Aktuální main — co již existuje a MUSÍ se znovu použít

Current `main` již má:

```text
party-registry
payment-term-catalog
commerce-customer-context
pricing
price-group-catalog
...
```

Nevytvářej jejich kopie.

---

# 7. Party Registry — NEVYTVÁŘET Invoice Customer

Invoice nesmí obsahovat paralelní canonical:

```text
Customer
CustomerAddress
CustomerICO
CustomerDIC
```

Party Registry zůstává ownerem Current identity.

Billing může uchovat:

```text
PartyRef
+
historical Invoice Recipient Snapshot
```

To není duplicita canonical identity.

Je to immutable historical business truth konkrétní faktury.

---

# 8. Využij Party BILLING address

Issue #214 a current Party Registry již definují:

```text
ADDRESS purpose = BILLING
```

Party-level `BILLING` address je reusable input/default.

Není to faktura.

Billing musí použít veřejné Party Registry kontrakty.

Relevantní current API již existuje například:

```text
PartyDetailApi
PartyContactPointsApi
PartyOfficialIdentifier...
```

Používej pouze skutečný current public owner contract.

Nikdy:

- nečti Party tabulky;
- neimportuj Party private service;
- nevytvářej BillingCustomer tabulku.

---

# 9. Billing address selection

Při vytváření draftu:

1. načti current Party;
2. načti current ADDRESS Contact Points;
3. identifikuj current `BILLING` možnosti;
4. nabídni je uživateli.

Pokud existuje current preferred BILLING address:

```text
předvyber ji
```

ale uživatel ji může změnit.

Pokud je více BILLING adres bez preferred:

```text
nevybírej náhodnou
```

Uživatel musí vybrat.

Pokud žádná BILLING adresa neexistuje:

umožni v TASK 07 **jednorázovou fakturační adresu**.

Jednorázová adresa:

- patří pouze draftu/faktuře;
- nemění Party Registry;
- nevytváří Contact Point;
- nevytváří Party correction.

---

# 10. Service Location není Billing Address

Explicitně zakázáno:

```text
invoice.billingAddress = job.serviceLocation
```

jen proto, že Job adresu obsahuje.

Service Location znamená:

> kde byla provedena práce.

Billing Address znamená:

> kam je vystaven billing document.

Mohou být stejné, ale nesmí se to automaticky předpokládat.

---

# 11. Nepoužívej Commerce InvoiceRecipientResolution naslepo

Current `main` má:

```text
InvoiceRecipientResolutionApi
```

v Commerce Customer Context.

Jeho current contract ale vyžaduje Commerce purchasing context:

```text
Cart
Storefront
Market
Channel
proposal revision
Commerce Customer Profile / Guest
...
```

Naše ERP Service Job toto nemá.

Proto:

**nevytvářej fake Cart/Storefront/Market jen proto, abys toto API mohl zavolat.**

TASK 07 má převzít jeho správné invarianty:

- Current Party source;
- explicitní choice;
- immutable historical snapshot;
- current source se nesmí zpětně propsat do issued invoice;

ale servisní Billing flow má vlastní bounded recipient-capture behavior.

Astra musí toto rozhodnutí zkontrolovat.

---

# 12. Klíčová optimalizace — Billing NESMÍ znovu číst Sales

Hotový `ServiceJob` již obsahuje accepted commercial handoff.

Z jeho current contractu znovu ověř konkrétní fields, ale v přiloženém ERP stavu obsahuje mimo jiné:

```text
sourceRef
sourceRevision

partyRef
legalEntityId

serviceLocation
serviceScope

commercialSummary:
    currency
    priceBasis
    total

acceptedAt
```

Proto Billing:

```text
Service Jobs
→ Billing
```

a NE:

```text
Service Jobs
→ Sales
→ nabídka
→ Billing
```

Nevytvářej druhou Sales dependency.

Nevytvářej Invoice → Sales DB join.

---

# 13. Invoice source

Pro tento demo scope:

```text
1 COMPLETED Service Job
→ maximálně 1 Invoice
```

Invoice lze vytvořit pouze z Jobu, který je v current operational status:

```text
COMPLETED
```

Použij skutečný current public Service Jobs contract.

Backend ověřuje:

- Job existuje;
- Job patří stejnému Tenant;
- Job patří Current Legal Entity;
- Job je COMPLETED;
- Job ještě nemá Invoice v Billing Documents.

Browser nesmí tvrdit:

```text
completed = true
```

jako autoritu.

---

# 14. Billing nesmí měnit Job

Nevytvářej:

```text
job.invoiceStatus
job.invoiceId
job.invoiced = true
job.paid = true
```

jako canonical Service Job fields.

Billing vlastní vztah:

```text
Invoice
→ sourceJobRef
```

Service Jobs zůstává beze změny.

„Již vyfakturováno“ je možné odvodit z Billing ownera.

---

# 15. Fáze 05/06 nejsou Billing prerequisite

Billing nesmí vyžadovat:

```text
Fleet
Job Expenses
Workforce costs
```

pro vystavení faktury.

Interní náklad firmy není zákaznická cena.

Invoice customer amount pochází z:

```text
accepted commercial terms
```

které již Service Job historicky převzal ze Sales.

Proto:

```text
Job Expenses
→ budoucí profitability
```

nikoli:

```text
Job Expenses
→ Invoice amount
```

---

# 16. Nový Billing Documents MicroVertical

Pokud discovery potvrdí, že po synchronizaci stále neexistuje current Billing Documents implementation, vytvoř jeden malý MicroVertical.

Doporučeně:

```text
deployment app:
billing-documents

module contract:
billing.documents
```

Přesný naming přizpůsob current Codesmith convention.

Nevytvářej:

```text
Finance
Accounting
Receivables
Invoices + Billing zvlášť
```

Jeden cohesive Billing Documents owner stačí.

---

# 17. Povinný Astra pre-review

Před generováním implementace dej Astře:

- tento TASK;
- current `main`;
- skutečný Service Job public contract;
- Party Registry billing/contact contracts;
- Payment Term Catalog contracts;
- relevantní issues.

Prompt:

> Review TASK 07 Billing Documents for the clearance-company ERP demo against current OntOS.
>
> Optimize for reuse and minimum scope.
>
> Check especially:
>
> 1. whether an existing Billing/Invoice owner already exists;
> 2. whether this duplicates Commerce Invoice Recipient Resolution;
> 3. whether fake Commerce Cart/Market/Storefront context is being introduced;
> 4. whether Party identity/address/identifiers are being duplicated instead of snapshotted correctly;
> 5. whether Payment Term Catalog is being duplicated;
> 6. whether Billing unnecessarily reads Sales when Service Job already owns the Accepted commercial handoff;
> 7. whether Billing incorrectly depends on Workforce, Fleet or Job Expenses;
> 8. whether Job is being mutated with invoice/payment state;
> 9. whether VAT/Tax is being reimplemented;
> 10. whether PDF/Documents/Email capabilities are being pulled forward;
> 11. whether the smallest correct implementation is one Invoice per Completed Service Job with DRAFT → ISSUED lifecycle.
>
> Separate blockers from future enhancements.

Fix blockers only.

---

# 18. Invoice Resource

Vytvoř durable Resource:

```text
Invoice
```

se stabilním:

```text
InvoiceRef
```

Invoice je scoped na:

```text
Tenant
+
Legal Entity
```

a obsahuje:

```text
sourceJobRef
partyRef
status

currency
priceBasis
acceptedAmount

payment term selection/snapshot
recipient selection/snapshot
issuer snapshot

invoiceNumber?
createdAt
issuedAt?
dueAt?
```

---

# 19. Lifecycle

Pro demo pouze:

```text
DRAFT
   ↓
ISSUED
```

User-facing:

```text
Koncept
Vystavená
```

Nic dalšího.

---

# 20. Co NENÍ Invoice lifecycle

Nepřidávej:

```text
PAID
PARTIALLY_PAID
OVERDUE
CANCELLED
CREDITED
REFUNDED
```

Tyto concepts budou patřit do dalších capability boundaries.

Splatnost data ano.

Stav „zaplaceno“ ne.

---

# 21. Jeden Job → jedna Invoice

Owner-level unique invariant:

```text
Tenant
+
Legal Entity
+
sourceJobRef
→ max 1 Invoice
```

UI precheck nestačí.

Musí být chráněno persistence/business invariantem i proti:

- double-clicku;
- retry;
- dvěma browser tabs;
- dvěma různým idempotency keys;
- concurrent create.

---

# 22. Create Invoice Draft

Business Action conceptuálně:

```text
Create Invoice Draft From Completed Job
```

Vstup má obsahovat pouze to, co caller skutečně vybírá.

Například:

```text
sourceJobRef
selectedBillingAddressRef?
oneTimeBillingAddress?
paymentTermRef
description?
```

Backend si sám získá z Job ownera:

```text
partyRef
legalEntityId
commercialSummary
serviceScope
source evidence
```

Caller NESMÍ dodávat authoritative:

```text
amount
currency
priceBasis
customerId
completed=true
```

---

# 23. Amount

Invoice částka pochází z:

```text
ServiceJob.commercialSummary.total
```

tedy z Accepted commercial handoffu.

V TASK 07 ji uživatel nemůže libovolně přepsat.

Pokud později potřebujeme:

```text
extra work
change order
discount
invoice adjustment
```

jde o samostatný business discovery.

Nepřidávej jej teď.

---

# 24. Invoice lines — maximální zjednodušení

Accepted Sales handoff v aktuálním ERP contractu poskytuje Billingu:

```text
commercialSummary.total
```

nikoli detailní nabídku jako účetní line set.

Proto kvůli faktuře:

**nerozšiřuj Sales API jen proto, abys vytvořil několik fakturačních řádků.**

Pro demo vytvoř jednu Invoice Line:

```text
Vyklizení dle zakázky
```

případně s bezpečným kontextem:

```text
Vyklizení – Ostrava
```

Amount:

```text
accepted commercial total
```

Tím využiješ existující handoff bez dalšího cross-module scope.

---

# 25. Invoice Line není Catalog Product

Nepoužívej:

```text
Catalog Product
Variant
Pricing Line
Commerce Order Line
```

pro tuto servisní fakturu.

Jde o servisní Billing Document navázaný na Service Job.

---

# 26. Currency

Current ERP demo používá:

```text
CZK
```

a Accepted Offer už currency nese.

Billing ji pouze snapshotuje.

Nevytvářej:

- FX;
- currency selector;
- conversion;
- exchange-rate service.

---

# 27. Price basis / VAT hranice

Accepted commercial summary obsahuje:

```text
EXCLUDING_VAT
```

nebo:

```text
INCLUDING_VAT
```

TASK 07 nesmí implementovat vlastní Tax engine.

Current `main` nemá Tax MicroVertical.

Proto:

### INCLUDING_VAT

Může být v demo Invoice přímo prezentováno jako accepted total s jasným labellem.

### EXCLUDING_VAT

Billing nesmí sám dopočítat DPH.

Pokud není dostupný authoritative Tax result:

vystavení finální Invoice musí:

- buď failnout typed `TAX_DATA_REQUIRED`;
- nebo být v UI jasně omezeno na draft.

Nepředstírej výslednou částku k úhradě.

Pro demonstrační happy path použij Job vzniklý z nabídky s:

```text
priceBasis = INCLUDING_VAT
```

---

# 28. Žádný hardcoded 21% VAT

Explicitně zakázáno:

```text
vat = total * 0.21
```

nebo:

```text
VAT = 21%
```

jen proto, že jde o českou firmu.

Tax ownership je samostatná capability.

---

# 29. Invoice Recipient — DRAFT

Draft nemusí hned kopírovat všechny customer fields.

Preferuj, aby DRAFT držel:

```text
partyRef
selected Party billing-address ref
nebo one-time address

paymentTermRef
```

a případné current presentation data četl přes owner contract.

Material historical snapshot vytvoř při Issue.

---

# 30. Invoice Recipient — ISSUE snapshot

Při:

```text
DRAFT → ISSUED
```

Invoice uloží vlastní immutable historical snapshot.

Minimálně:

```text
display/legal name
billing address

ICO?
CZ_DIC?
```

pokud jsou bezpečně a autoritativně dostupné přes current Party Registry public contract.

Nepřidávej fake hodnoty, pokud identifier chybí.

Snapshot zároveň uchová relevantní source references/revisions, pokud je current contract poskytuje.

---

# 31. Official Identifiers

Party Registry již vlastní:

```text
ICO
CZ_DIC
```

Nevytvářej:

```text
invoiceCustomer.icoMaster
invoiceCustomer.dicMaster
```

jako Current master data.

Invoice pouze snapshotuje hodnotu skutečně použitou při Issue.

Pokud current veřejný API contract neposkytuje bezpečný způsob určit Current identifier:

nečti DB ani private service.

Použij pouze skutečně publikovaný owner contract nebo vynech optional field z demo invoice.

---

# 32. Historical immutability test

Po vystavení faktury:

```text
Party:
Novák s.r.o.
Adresa A
```

později změní adresu na:

```text
Adresa B
```

Historical Invoice musí stále zobrazovat:

```text
Adresa A
```

To je zásadní invariant.

---

# 33. Payment Term — znovu použít current module

Current `main` již má skutečný:

```text
payment-term-catalog
module:
payment.term-catalog
```

a public contracts.

Nevytvářej:

```text
invoice.dueDays = 14
```

jako nový semantic owner.

Nevytvářej:

```text
billing_payment_terms
```

tabulku.

---

# 34. Current Payment Terms

Pro výběr použij public:

```text
CurrentPaymentTerms
```

nebo jeho aktuální ekvivalent po synchronizaci.

Current Payment Term semantics již podporují mimo jiné:

```text
IMMEDIATE

NET_DAYS
  days
  dueDateAnchor = INVOICE_ISSUED_AT
```

UI má uživateli nabídnout current owner-issued terms.

---

# 35. Nehardcoduj NET_14

Dokumentace používá:

```text
NET_14
NET_30
```

jako příklady.

To neznamená, že konkrétní current fixture vždy obsahuje NET_14.

Proto:

```text
nenastavuj paymentTerm = NET_14
```

napevno v Billing kódu.

Použij skutečný Payment Term Catalog.

Pro demo lze existující management Action použít k vytvoření například NET_14 configuration, pokud žádný suitable term neexistuje.

To ale provádí Payment Term Catalog owner, ne Billing.

---

# 36. Payment Term snapshot

Při Issue uchovej alespoň:

```text
paymentTermRef
semanticRevisionId
code/name
semantics
```

potřebné pro vysvětlení issued Invoice.

Pozdější změna/retirement Payment Term:

```text
nesmí změnit starou fakturu
```

---

# 37. Due date

`dueAt` se určí z:

```text
Issued Payment Term semantics
+
issuedAt
```

Nepoužívej frontend calculation jako authority.

Před implementací zjisti, zda current Payment Term Catalog publikuje podporovaný calculation contract/helper.

### Pokud ano

Použij jej.

### Pokud existuje pouze owner-private implementation

Nekopíruj private file do Billing bez review.

Požádej Astru posoudit nejmenší správné řešení:

- owner-published calculation contract;
- nebo explicitní bounded calculation pouze nad public typed semantics.

Preferuj reuse.

---

# 38. Invoice number

Invoice number vlastní Billing Documents.

DRAFT nemá final invoice number.

Při Issue vznikne číslo.

Pro jednoduché demo použij deterministic convention například:

```text
2026-000001
2026-000002
...
```

scoped na:

```text
Legal Entity
+
calendar year
```

Nevytvářej univerzální document-numbering framework.

---

# 39. Number assignment musí být atomický

Dva concurrent Issue requests nesmějí vytvořit:

```text
2026-000001
2026-000001
```

Použij owner-local DB invariant / sequence mechanismus podle current repository pattern.

Musí být concurrency-safe.

---

# 40. Lost response

Pokud Issue commitne:

```text
2026-000123
```

ale HTTP response se ztratí:

retry musí obnovit:

```text
stejnou Invoice
stejné číslo
```

ne vytvořit další číslo/fakturu.

Použij standardní Core Action idempotency/commit resolution.

---

# 41. Issuer

Invoice musí reprezentovat Current Legal Entity jako dodavatele.

Nejprve zjisti, jaký current public Core contract poskytuje bezpečné Legal Entity invoice-relevant údaje.

Current Core již vlastní minimálně identity typu:

```text
legal name
registration country
registration number
```

Nevytvářej druhou canonical Legal Entity.

---

# 42. Billing Issuer Settings

Pokud current Core/public organization contract neposkytuje všechna invoice-specific presentation data, Billing smí mít **malé Legal-Entity-scoped Billing Issuer Settings**.

Pouze skutečně invoice-specific data, například:

```text
billing address
optional tax identifier
optional bank account display
```

Ne:

```text
novou Organization
novou Legal Entity
company registry
general company profile
```

Pokud by `legalName`/registration number byly z Core public contractu dostupné, nekopíruj je jako Current master.

Invoice je při Issue samozřejmě snapshotuje.

---

# 43. Billing Issuer Settings není samostatný MicroVertical

Pokud je potřeba:

```text
BillingIssuerSettings
```

patří dovnitř:

```text
billing.documents
```

pro tento demo scope.

Nevytvářej:

```text
Company Settings vertical
Finance Settings vertical
Organization Registry
```

jen kvůli faktuře.

---

# 44. Invoice Draft editace

DRAFT lze změnit pouze v povoleném malém rozsahu.

Například:

```text
selected billing address
one-time billing address
payment term
line description
```

Nelze měnit:

```text
source Job
accepted amount
currency
price basis
Party
Legal Entity
```

---

# 45. Issue Action

Conceptuálně:

```text
Issue Invoice
```

musí v jednom governed owner transition:

1. ověřit DRAFT;
2. ověřit source Job;
3. ověřit relevantní Current dependencies;
4. získat Party snapshot;
5. získat Payment Term snapshot;
6. získat issuer snapshot;
7. spočítat dueAt;
8. rezervovat/vytvořit invoice number;
9. změnit DRAFT → ISSUED;
10. zaznamenat issuedAt;
11. commitnout immutable invoice facts.

---

# 46. Server clock

Authoritative:

```text
issuedAt
```

pochází z trusted runtime/server clock.

Browser neposílá final:

```text
issuedAt
```

---

# 47. Issued Invoice je immutable

Po:

```text
ISSUED
```

neumožni běžný Update.

Material změna issued faktury by patřila budoucím:

```text
corrective document
credit note
```

které TASK 07 záměrně neimplementuje.

---

# 48. Žádný hard delete ISSUED Invoice

Issued Invoice:

- lze číst;
- zůstává historicky zachována.

TASK 07 neřeší storno/delete workflow.

---

# 49. Actions — minimální sada

Preferuj pouze:

```text
Create Invoice Draft From Completed Job

Update Invoice Draft

Issue Invoice
```

Pokud je nutné:

```text
Update Billing Issuer Settings
```

může být čtvrtá explicitní capability.

Nevytvářej:

```text
Set Invoice Status
PATCH Invoice
Delete Invoice
Mark Paid
Send Invoice
Generate Credit Note
```

---

# 50. Reads — minimální sada

Stačí:

```text
Invoice List
Invoice Detail
Invoiceable Completed Jobs
```

plus případně malý create-form support read, pokud je skutečně potřeba.

Nedělej generic Finance query engine.

---

# 51. Invoiceable Jobs

Toto je derived Billing view:

```text
Service Jobs with status COMPLETED
-
Jobs already referenced by Invoice
```

Zdroj Job statusu zůstává Service Jobs owner.

Billing pouze skládá public Job read + své Invoice records.

Nevytvářej:

```text
job.readyForInvoice boolean
```

---

# 52. Page

Navigation:

```text
Faktury
```

Doporučeně:

```text
/invoices
```

a detail:

```text
/invoices/:id
```

přes current generated page mechanism.

---

# 53. Invoice List

Zobraz minimálně:

```text
Číslo / Koncept
Zákazník
Zakázka
Částka
Vystaveno
Splatnost
Stav
```

DRAFT:

```text
Koncept
```

ISSUED:

```text
2026-000001
```

---

# 54. Create Invoice UI

Flow:

```text
Faktury
→ Nová faktura
→ vybrat dokončenou zakázku
```

Po výběru Jobu automaticky načti:

```text
customer Party
accepted amount
currency
price basis
service context
```

Uživatel doplní/zkontroluje:

```text
fakturační adresu
platební podmínku
popis
```

Pak:

```text
Uložit koncept
```

---

# 55. Detail DRAFT

Zobraz:

```text
Koncept faktury

Dodavatel
Odběratel

Zdrojová zakázka

Popis
Částka
Price basis

Platební podmínka
Předpokládaná splatnost
```

Primary Action:

```text
Vystavit fakturu
```

---

# 56. Detail ISSUED

Zobraz:

```text
FAKTURA
2026-000001

Dodavatel

Odběratel
IČO / DIČ pokud existují
Fakturační adresa

Datum vystavení
Datum splatnosti

Zakázka / popis

Částka
Cena včetně/bez DPH dle source basis
```

a jasný:

```text
Vystavená
```

stav.

---

# 57. Printable view

TASK 07 nemusí implementovat PDF generation backend.

Detail ISSUED Invoice musí být rozumně:

```text
print-friendly
```

aby bylo možné použít:

```text
browser Print
→ Save as PDF
```

pro demo.

---

# 58. Documents Center NEIMPLEMENTOVAT

#253 má zvláštní:

```text
Documents Center
```

Current `main` jej zatím nemá.

Proto nevytvářej:

- PDF storage service;
- object storage;
- document-version module;
- base64 PDF v Billing DB.

Až vznikne Documents Center, Invoice může na něj publikovat/linkovat document artifact.

---

# 59. Email NEIMPLEMENTOVAT

#253 vlastní Communications/Messaging zvlášť.

TASK 07:

```text
nevytváří SMTP
nevytváří email sender
nevytváří Send Invoice email action
```

Pro demo stačí fakturu zobrazit/printnout.

---

# 60. Payment NEIMPLEMENTOVAT

Invoice splatnost:

```text
ano
```

Payment state:

```text
ne
```

Nepřidávej:

```text
paidAt
paidAmount
paymentStatus
bankTransactionId
```

Billing Document není Payment transaction.

---

# 61. OVERDUE není persisted lifecycle

Pro demo případně UI může odvodit:

```text
dueAt < now
```

a pouze vizuálně zobrazit:

```text
Po splatnosti
```

ale nevytvářej canonical:

```text
status = OVERDUE
```

bez receivables/payment ownera.

Pokud by to komplikovalo UI, vynech overdue úplně.

---

# 62. Job Expenses se nesmí propsat do faktury

Explicitní test:

```text
Job accepted price = 20 000 Kč
Job internal expenses = 8 000 Kč
```

Invoice:

```text
20 000 Kč
```

nikoli:

```text
8 000
12 000
28 000
```

Expenses jsou interní ekonomika.

---

# 63. Workforce se nesmí propsat do faktury

Přiřazení:

```text
Petr
Jan
Karel
```

nemění Invoice amount.

Scheduled/actual staff není fakturační line v TASK 07.

---

# 64. Fleet se nesmí propsat do faktury

Použité vozidlo nemění Invoice commercial terms.

Transport je již součást Accepted Offer total, pokud byl naceněn.

Nevytvářej z Vehicle Assignment novou invoice line.

---

# 65. RLS / isolation

Invoice musí být:

```text
Tenant scoped
Legal Entity scoped
```

Forced RLS podle current repository conventions.

Cross-Legal-Entity read/write musí fail closed.

---

# 66. Security

Browser nesmí autoritativně zadat:

```text
tenantId
legalEntityId
invoiceAmount
invoiceNumber
issuedAt
sourceJobCompleted
```

Trusted scope/context a owner reads rozhodují.

---

# 67. BDD — create draft

```gherkin
Scenario: Completed job creates invoice draft
  Given Service Job J belongs to the Current Legal Entity
  And J is COMPLETED
  And J has accepted commercial total 20000 CZK
  And no Invoice exists for J
  When authorized staff creates an Invoice Draft from J
  Then one Invoice is created
  And Invoice status is DRAFT
  And sourceJobRef points to J
  And amount is 20000 CZK
  And the browser did not supply the authoritative amount
```

---

# 68. BDD — non-completed Job

```gherkin
Scenario: Planned job cannot be invoiced
  Given Service Job J is PLANNED
  When staff requests an Invoice Draft from J
  Then creation is rejected with a typed business outcome
  And no Invoice is created
```

---

# 69. BDD — duplicate

```gherkin
Scenario: One job cannot produce two invoices
  Given Job J already has Invoice I
  When another request tries to create Invoice from J
  Then no second Invoice is created
```

---

# 70. BDD — billing address

```gherkin
Scenario: Preferred billing address is offered
  Given Party P has current preferred BILLING address A
  When staff creates an Invoice Draft for P
  Then address A is offered as the default
  And staff may explicitly select another valid billing address
```

---

# 71. BDD — no arbitrary address

```gherkin
Scenario: Several billing addresses have no preferred
  Given Party P has current BILLING addresses A and B
  And neither is preferred
  When Invoice creation opens
  Then Billing does not silently select A or B
  And staff must choose
```

---

# 72. BDD — service address boundary

```gherkin
Scenario: Service location is not automatically billing address
  Given Job J was performed at address A
  And Party has billing address B
  When Invoice Draft is created
  Then Billing does not automatically treat A as Invoice Recipient address
```

---

# 73. BDD — snapshot

```gherkin
Scenario: Party changes after invoice issue
  Given Invoice I was ISSUED with recipient address A
  When Party Registry later changes Current billing address to B
  Then Invoice I still contains address A
```

---

# 74. BDD — Payment Term

```gherkin
Scenario: Current NET payment term produces due date
  Given Current Payment Term T has NET_DAYS semantics
  And T specifies 14 calendar days from INVOICE_ISSUED_AT
  When Invoice is issued at 2026-10-01
  Then Invoice snapshots T
  And dueAt corresponds to the owner-defined 14-day semantics
```

Do not hardcode NET_14 identity.

---

# 75. BDD — invoice number race

```gherkin
Scenario: Two invoices are issued concurrently
  Given two Draft Invoices in the same Legal Entity and year
  When they are issued concurrently
  Then both become ISSUED
  And their invoice numbers are distinct
```

---

# 76. BDD — lost Issue response

```gherkin
Scenario: Invoice issue response is lost
  Given Issue Invoice committed Invoice number 2026-000042
  But the caller did not receive the response
  When the exact logical operation is recovered
  Then the same Invoice is returned
  And no new invoice number is consumed for a duplicate Invoice
```

---

# 77. BDD — Job unchanged

```gherkin
Scenario: Issuing invoice does not mutate Service Job
  Given Completed Job J
  When Invoice I is issued for J
  Then J remains COMPLETED
  And Service Jobs does not acquire INVOICED or PAID lifecycle state
```

---

# 78. BDD — expenses ignored

```gherkin
Scenario: Internal costs do not change customer invoice
  Given accepted Job total is 20000 CZK
  And internal job expenses are 8000 CZK
  When Invoice is created
  Then Invoice commercial amount remains 20000 CZK
```

Tento scénář lze otestovat až pokud Job Expenses skutečně existují.

TASK 07 na nich nesmí být závislý.

---

# 79. BDD — historical Payment Term

```gherkin
Scenario: Payment Term later changes
  Given Invoice I was ISSUED with Payment Term revision R1
  When the Payment Term owner later publishes or activates another semantic revision
  Then I remains explained by R1
  And its due date does not change
```

---

# 80. BDD — VAT boundary

```gherkin
Scenario: Exclusive-VAT source has no Tax decision
  Given Job accepted commercial summary is EXCLUDING_VAT
  And no authoritative Tax result exists
  When staff attempts to Issue the Invoice
  Then Billing does not invent a VAT rate
  And Issue returns a clear typed TAX_DATA_REQUIRED-style outcome
```

---

# 81. Mobile acceptance

Na běžném mobile viewportu musí jít:

```text
Faktury
→ Nová
→ vybrat dokončenou zakázku
→ zvolit adresu
→ zvolit platební podmínku
→ uložit
→ otevřít koncept
→ vystavit
→ zobrazit vystavenou fakturu
```

Bez horizontálního scrollu hlavního workflow.

---

# 82. Tests — focused

Minimálně pokryj:

### Source Job

- COMPLETED succeeds;
- NEW rejected;
- PLANNED rejected;
- IN_PROGRESS rejected;
- wrong Tenant;
- wrong Legal Entity;
- missing Job;
- Jobs unavailable.

### Duplicate safety

- same Job twice;
- double click;
- concurrent create;
- lost response;
- different Action keys for same Job.

### Party

- preferred BILLING;
- several addresses/no preferred;
- one-time address;
- Party unavailable;
- ended address before Issue;
- Party change after Issue does not rewrite Invoice.

### Payment Term

- Current usable term;
- retired term before Issue;
- IMMEDIATE;
- NET_DAYS;
- owner unavailable;
- historical snapshot.

### Invoice

- create DRAFT;
- update allowed DRAFT fields;
- reject amount change;
- Issue;
- unique numbering;
- concurrent numbering;
- immutable after Issue;
- list;
- detail.

### Security

- authorization failure;
- module state;
- legal-entity isolation;
- browser cannot forge amount/number/time.

### UI

- empty;
- loading;
- retryable unavailable;
- create;
- detail draft;
- detail issued;
- mobile;
- print layout.

---

# 83. Neopakuj framework tests

Nepal tokeny na testování obecných Core invariantů, které již prokazuje current framework, pokud nový Billing code nepřidává jejich vlastní behavior.

Testuj zejména:

```text
Billing business rules
+
cross-owner contracts
+
new persistence invariants
+
UI
```

---

# 84. Povinný Astra final review

Po implementaci dej Astře celý relevantní diff.

Prompt:

> Perform a strict final review of TASK 07 Billing Documents against current OntOS and the actual ERP branch.
>
> Find real defects and duplication.
>
> Check:
>
> 1. Did we create a second Party/customer/address/identifier master?
> 2. Did we incorrectly reuse or duplicate Commerce InvoiceRecipientResolution?
> 3. Did we fabricate Commerce Cart/Market/Storefront context?
> 4. Did Billing call Sales even though Service Job already carries accepted commercial truth?
> 5. Can a browser forge amount, currency, price basis or completion?
> 6. Can one Job create multiple Invoices?
> 7. Can two concurrent Issues receive one invoice number?
> 8. Is Payment Term Catalog reused rather than copied?
> 9. Is due-date behavior duplicated unnecessarily?
> 10. Does an Issued Invoice retain recipient and Payment Term snapshots after Current source changes?
> 11. Does Billing mutate Job lifecycle?
> 12. Does it depend unnecessarily on Workforce, Fleet or Expenses?
> 13. Did it accidentally build Payment/receivables?
> 14. Did it accidentally build Tax/VAT?
> 15. Did it accidentally build Documents Center/PDF storage?
> 16. Did it accidentally build Communications/email?
> 17. Is the implementation larger than required for this ERP demo?
> 18. Can any new Resource, Action, API or table be removed by reusing an existing current owner contract?
>
> Separate blockers from optional future improvements.

Oprav blockers a skutečné duplication defects.

Nevytvářej nové nice-to-have features.

---

# 85. Validation

Nejdříve current generator help.

Nepředpokládej starou syntaxi:

```bash
mise exec -- pnpm scaffold:module-contract -- --help
mise exec -- pnpm scaffold:resource -- --help
mise exec -- pnpm scaffold:action -- --help
mise exec -- pnpm scaffold:module-api -- --help
mise exec -- pnpm scaffold:microvertical-page -- --help
```

Použij current Codesmith workflow.

Během práce:

```bash
mise exec -- pnpm check:local --scope <relevant-scope>
```

Před dokončením minimálně:

```bash
mise install
mise exec -- pnpm install
mise exec -- pnpm check
mise exec -- pnpm build
```

A protože vznikne nový MicroVertical/persistence/public surface, proveď current relevant:

```text
db generation/check
db migrate
db verify
integration
module-contract checks
API checks
deployment-impact
Node proof
Cloudflare proof
```

podle aktuálního `app/README.md` a `app/package.json`.

---

# 86. Definition of Done

Demo musí umožnit:

```text
Zakázka
COMPLETED
20 000 Kč
        ↓
Nová faktura
        ↓
Odběratel:
Novák s.r.o.

Billing address:
Masarykova 10
Ostrava

Payment term:
14 dní
        ↓
Uložit koncept
        ↓
Vystavit
        ↓
FAKTURA
2026-000001

Datum vystavení:
...

Splatnost:
...

Vyklizení dle zakázky
20 000 Kč

Vystavená
```

Současně musí platit:

```text
1 Completed Job
→ max 1 Invoice
```

a:

- částka pochází ze Service Job accepted commercial snapshotu;
- Billing znovu nečte Sales;
- Job není změněn na INVOICED;
- Party zůstává identity owner;
- Invoice Recipient je historical snapshot;
- Payment Term Catalog zůstává ownerem term semantics;
- VAT se nevymýšlí;
- Expense není invoice amount;
- Workforce není invoice input;
- Fleet není invoice input;
- Payment state nevzniká;
- PDF storage nevzniká;
- email capability nevzniká;
- Issued Invoice je immutable;
- invoice number je concurrency-safe;
- Legal Entity isolation funguje;
- UI je použitelné na telefonu.

---

# 87. Závěrečný CODEX report

Po dokončení uveď:

1. přesný výchozí ERP commit;
2. aktuální `origin/main` commit použitý při synchronizaci;
3. zda byly nalezeny novější TASK 05/06 změny oproti přiloženému snapshotu;
4. jaké duplication candidates byly nalezeny před implementací;
5. co bylo znovu použito z Party Registry;
6. co bylo znovu použito z Payment Term Catalog;
7. proč nebyl použit Commerce InvoiceRecipientResolution přímo;
8. jaký Billing Documents module vznikl;
9. Resource(s);
10. Actions;
11. Reads;
12. přesný Invoice lifecycle;
13. způsob vazby Invoice → Service Job;
14. způsob garance 1 Job → max 1 Invoice;
15. recipient snapshot semantics;
16. Payment Term snapshot semantics;
17. invoice-numbering mechanismus;
18. VAT/Tax boundary;
19. issuer-data řešení;
20. printable/PDF boundary;
21. proč Billing nezávisí na Workforce/Fleet/Expenses;
22. Astra pre-review blockers a opravy;
23. Astra final-review blockers a opravy;
24. všechny validation commands a výsledky;
25. hlavní změněné soubory.

Neupravuj GitHub Issues, labels, comments ani PR metadata, pokud to není výslovně zadáno.

---

## Implementation evidence

- Výchozí ERP commit: `aa3052527a65c231faa40381cc5c81661d92cf16`; synchronizovaný `origin/main`: `8caa7409d7ecc2812512c844db9b1bd5008b23c9`. Výchozí větev již obsahovala novější TASK 05/06 změny.
- Duplication discovery potvrdilo jako current ownery Service Jobs pro accepted commercial handoff, Party Registry pro identitu, adresy a oficiální identifikátory a Payment Term Catalog pro splatnost. Commerce Invoice Recipient Resolution nebyl použit, protože vyžaduje Commerce profil a storefront context, které staff ERP flow nemá.
- Vznikl jediný modul `billing.documents` s Resource `Invoice`, Actions `create-invoice-draft`, `update-invoice-draft`, `issue-invoice` a governed Reads pro seznam, detail, podporu konceptu, fakturovatelné zakázky a stav commitu.
- Lifecycle je pouze `DRAFT → ISSUED`. Invoice odkazuje na Service Job přes `ResourceRef`; unikátní DB constraint na Tenant + Legal Entity + Source Job garantuje nejvýše jednu fakturu. Číslování používá atomicky zamčený roční čítač pro Legal Entity.
- Při Issue se ukládá historický recipient snapshot z Current Party Registry, Payment Term semantic snapshot a issuer snapshot. `EXCLUDING_VAT` bez autoritativního Tax výsledku je typed rejection. PDF zůstává pouze print view; Documents, e-mail, Payment, receivables, Workforce, Fleet a Job Expenses nejsou závislosti Billingu.
- Astra pre-review vedlo k minimálnímu owner modelu bez Sales/Commerce/Expenses závislostí. Final review nalezlo recovery, budoucí `validTo`, idempotentní Payment Term seed a chybějící Action testy; všechny blokery byly opraveny. Následná Astra kontrola nenašla žádný zbývající blocker.
- Focused validace: Billing unit `16/16`, component `14/14`, PostgreSQL integration `3/3`, bootstrap `16/16`; Billing `typecheck`, `test:types`, `db:check`, `db:verify`, root `typecheck`, `database-access:check`, `lean-core:check`, `i18n:boundaries`, `api:check` a `contract:check` prošly. Dvojí živé spuštění `local:initialize:billing` prošlo a prokázalo reuse existující vhodné splatnosti.
- Povinné `mise exec -- pnpm check` nelze na tomto Windows spustit kvůli MZ shim parsing; přímý pinned `pnpm check` doběhl k pěti známým Windows-only baseline selháním v `test:lint-rules` (čtyři `EPERM` symlink a jeden `ERR_UNSUPPORTED_ESM_URL_SCHEME` pro `c:`). Relevantní checks výše prošly bez snížení pravidel.
