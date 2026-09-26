import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';

test('demo customer → completed job → recorded expense → issued invoice → dashboard', async ({ page }, testInfo) => {
  const address = `ERP demo ${randomUUID().slice(0, 8)}`;
  const description = `${address} – vyklizení bytu`;
  // Fixed fixture interval; run against a fresh disposable demo database.
  const appointment = '2026-11-09';
  const customerName = 'Jan Novák - Demo zákazník';
  const crewButtonName = 'Upravit posádku';
  const scheduleButtonName = 'Harmonogram';
  const removeButtonName = 'Odebrat ze zakázky';
  const readyForBilling = 'Připraveno k fakturaci';
  const workforcePath = '/cs/workforce';
  const jobsPath = '/cs/jobs';

  await test.step('login and search for the bootstrapped Party', async () => {
    await page.goto('/cs/login');
    await page.locator('input[name=login]').fill('demo@test.com');
    await page.locator('input[name=password]').fill('password1234');
    await page.getByRole('button', { exact: true, name: 'Přihlásit se' }).click();
    await expect(page).toHaveURL(/\/cs$/u);
    await page.goto('/cs/inquiries');
    await page.getByRole('button', { exact: true, name: 'Nová poptávka' }).click();
    await page.locator('#party-query').fill('Jan Novák');
    await page.getByRole('button', { exact: true, name: 'Vyhledat' }).click();
    await page.getByRole('button', { exact: true, name: customerName }).click();
  });

  await test.step('create, price, send and accept the inquiry', async () => {
    await page.locator('#addressLine').fill(address);
    await page.locator('#city').fill('Praha');
    await page.locator('#postalCode').fill('11000');
    await page.locator('#description').fill(description);
    await page.locator('#requestedDate').fill(appointment);
    await page.getByRole('button', { exact: true, name: 'Uložit poptávku' }).click();
    await page.getByRole('button', { exact: true, name: 'Přejít k nacenění' }).click();
    await page.getByRole('combobox', { name: 'Zadaná cena' }).click();
    await page.getByRole('option', { exact: true, name: 'Cena včetně DPH' }).click();
    await page.locator('#work').fill('5000');
    await page.locator('#transport').fill('1000');
    await page.locator('#disposal').fill('500');
    await page.locator('#estimatedPersonHours').fill('4');
    await page.getByRole('button', { exact: true, name: 'Uložit kalkulaci' }).click();
    await page.getByRole('button', { exact: true, name: 'Označit nabídku jako odeslanou' }).click();
    await page.locator('#evidenceNote').fill('Telefonické potvrzení fiktivním zákazníkem při lokální ukázce.');
    await page.getByRole('button', { exact: true, name: 'Přijata' }).click();
    await page.getByRole('link', { exact: true, name: 'Založit zakázku' }).click();
  });

  await test.step('create the Service Job and schedule a complete interval', async () => {
    await page.getByRole('button', { exact: true, name: `${address}, Praha — Založit zakázku` }).click();
    await page.locator('#scheduled-start').fill(`${appointment}T13:00`);
    await page.locator('#expected-duration').fill('120');
    await page.getByRole('button', { exact: true, name: 'Uložit termín' }).click();
    await expect(page.getByText('Naplánovaná', { exact: true })).toBeVisible();
    await expect(page.getByText('6500.00 CZK (včetně DPH)', { exact: true })).toBeVisible();
  });

  await test.step('assign the demo worker and verify persistence after reload', async () => {
    await page.goto(workforcePath);
    await page.getByRole('button', { exact: true, name: scheduleButtonName }).click();
    await page.locator('#week-start').fill(appointment);
    const job = page.getByRole('article').filter({ has: page.getByRole('heading', { name: `${address}, Praha` }) });
    await job.getByRole('button', { exact: true, name: crewButtonName }).click();
    const selector = page.getByRole('region', { exact: true, name: crewButtonName });
    await expect(selector.getByText('Petr Dvořák', { exact: true })).toBeVisible();
    await selector.getByRole('button', { exact: true, name: 'Přiřadit' }).click();
    await expect(selector.getByRole('button', { exact: true, name: removeButtonName })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { exact: true, name: scheduleButtonName }).click();
    await page.locator('#week-start').fill(appointment);
    await job.getByRole('button', { exact: true, name: crewButtonName }).click();
    await expect(selector.getByRole('button', { exact: true, name: removeButtonName })).toBeVisible();
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('assigned.png') });
  });

  await test.step('start, complete and reload the persisted job', async () => {
    await page.goto(jobsPath);
    const job = page.getByRole('listitem').filter({ hasText: `${address}, Praha` });
    const open = job.getByRole('button', { exact: true, name: 'Otevřít zakázku' });
    await open.click();
    await page.getByRole('button', { exact: true, name: 'Zahájit zakázku' }).click();
    await page.getByRole('button', { exact: true, name: 'Dokončit zakázku' }).click();
    await expect(page.getByText(readyForBilling, { exact: true })).toBeVisible();
    await page.reload();
    await open.click();
    await expect(page.getByText(readyForBilling, { exact: true })).toBeVisible();
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('completed.png') });
  });

  await test.step('record an expense and verify persisted costs after reload', async () => {
    await page.goto('/cs/expenses');
    const job = page.getByRole('listitem').filter({ hasText: description });
    await job.getByRole('button', { exact: true, name: 'Otevřít ekonomiku' }).click();
    await page.getByRole('button', { exact: true, name: 'Přidat náklad' }).click();
    await page.locator('#expense-category').selectOption('TRANSPORT');
    await page.locator('#expense-description').fill('Demo doprava – ověření zápisu');
    await page.locator('#expense-amount').fill('1250,00');
    await page.getByRole('button', { exact: true, name: 'Uložit náklad' }).click();
    await expect(page.getByText('Demo doprava – ověření zápisu', { exact: true })).toBeVisible();
    await page.reload();
    await job.getByRole('button', { exact: true, name: 'Otevřít ekonomiku' }).click();
    const costs = page
      .getByRole('article')
      .filter({ has: page.getByRole('heading', { name: 'Dosud evidované náklady' }) });
    await expect(costs).toContainText(/1\s*250,00/u);
    await expect(page.getByText('Demo doprava – ověření zápisu', { exact: true })).toBeVisible();
    // Gross accepted prices must not be presented as comparable to net costs.
    await expect(
      page.getByText('Cena včetně DPH není přímo srovnatelná s náklady bez DPH.', { exact: true }),
    ).toBeVisible();
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('expense.png') });
  });

  await test.step('show the recorded expense on the invoiceable dashboard job', async () => {
    await page.goto('/cs/dashboard');
    const job = page.getByRole('listitem').filter({ hasText: description });
    await expect(job).toContainText(/1\s*250,00/u);
    await expect(page.getByText(/je dočasně nedostupná/u)).toHaveCount(0);
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('dashboard-costs.png') });
  });

  const invoiceNumber = await test.step('create, save and issue an invoice through the UI', async () => {
    await page.goto('/cs/invoices');
    await page.getByRole('button', { exact: true, name: 'Nová faktura' }).click();
    const sourceJob = page.getByRole('listitem').filter({ hasText: description });
    await sourceJob.getByRole('button', { exact: true, name: 'Uložit koncept' }).click();
    await page.getByRole('textbox', { exact: true, name: 'Popis' }).fill(description);
    await page.getByRole('radio', { name: 'Jednorázová fakturační adresa' }).check();
    await page.getByRole('textbox', { exact: true, name: 'Ulice a číslo' }).fill(address);
    await page.getByRole('textbox', { exact: true, name: 'Město' }).fill('Praha');
    await page.getByRole('textbox', { exact: true, name: 'PSČ' }).fill('11000');
    await page.getByRole('combobox', { name: 'Platební podmínka' }).selectOption({ label: 'Splatnost 14 dní' });
    await page.getByRole('button', { exact: true, name: 'Uložit změny' }).click();
    await page.getByRole('button', { exact: true, name: 'Vystavit fakturu' }).click();
    const issued = page.getByTestId('issued-invoice');
    await expect(issued).toContainText(customerName);
    await expect(issued).toContainText(/6\s*500,00/u);
    await expect(issued.getByRole('heading', { level: 2 })).toHaveText(/FAKTURA .+/u);
    const invoiceHeading = await issued.getByRole('heading', { level: 2 }).textContent();
    await page.reload();
    await page
      .getByRole('listitem')
      .filter({ hasText: description })
      .getByRole('button', { exact: true, name: 'Otevřít' })
      .click();
    await expect(issued.getByRole('heading', { level: 2 })).toHaveText(invoiceHeading ?? 'Missing invoice number');
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('issued-invoice.png') });
    return invoiceHeading?.replace(/^FAKTURA /u, '') ?? 'Missing invoice number';
  });

  await test.step('show the issued invoice on the refreshed dashboard', async () => {
    await page.goto('/cs/dashboard');
    const issuedPanel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { exact: true, name: 'Vystavené faktury' }) });
    await expect(issuedPanel).toContainText(invoiceNumber);
    await expect(issuedPanel).toContainText(/6\s*500,00/u);
    const invoiceablePanel = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { exact: true, name: 'K fakturaci a ekonomika' }) });
    await expect(invoiceablePanel).not.toContainText(description);
    await expect(page.getByText(/je dočasně nedostupná/u)).toHaveCount(0);
    await page.screenshot({ fullPage: true, path: testInfo.outputPath('dashboard-issued.png') });
  });
});
