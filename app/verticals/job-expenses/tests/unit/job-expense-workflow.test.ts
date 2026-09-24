import { bindActionTestServices, makeActionTestHarness } from '@app/core-runtime/testing/actions';
import { GatewayPrincipalVerifierConfiguration } from '@app/gateway-principal-verifier/server';
import { DateTime, Effect, Layer, Option, Predicate } from 'effect';
import { TestClock } from 'effect/testing';
import { expect, it } from 'effect-rstest';
import { recordJobExpenseAction } from '../../src/actions/record-job-expense.action.ts';
import { updateJobExpenseAction } from '../../src/actions/update-job-expense.action.ts';
import { voidJobExpenseAction } from '../../src/actions/void-job-expense.action.ts';
import type { ExpenseServices } from '../../src/services/expense-services.service.ts';
import type { JobExpense } from '../../shared/resources/job-expense.ts';
import { JobExpenseRejected, JobExpenseUnavailable } from '../../shared/resources/job-expense-failure.ts';
import { jobFixture, principal } from '../fixtures.ts';

const job = jobFixture();
const setup = Effect.fn('JobExpenses.testSetup')(function* setup(
  options: { denied?: boolean; jobStatus?: 'COMPLETED' | 'NEW'; uncertain?: boolean } = {},
) {
  const selectedJob = jobFixture(undefined, undefined, undefined, options.jobStatus);
  const expenses = new Map<string, JobExpense>();
  let jobsOnline = true;
  const get = (id: string) => {
    const expense = expenses.get(id);
    return expense === undefined
      ? Effect.fail(new JobExpenseRejected({ code: 'not_found', reason: 'Missing' }))
      : Effect.succeed(expense);
  };
  const save = (expense: JobExpense, expectedRevision: number) => {
    const current = expenses.get(expense.ref.resourceId);
    if (current?.revision !== expectedRevision || current.status !== 'RECORDED') {
      return Effect.fail(new JobExpenseRejected({ code: 'revision_conflict', reason: 'Stale' }));
    }
    expenses.set(expense.ref.resourceId, expense);
    return Effect.succeed(expense);
  };
  const services: ExpenseServices = {
    aggregate: () => Effect.die('Aggregate is not used by Actions'),
    get,
    insert: (expense) =>
      Effect.sync(() => {
        expenses.set(expense.ref.resourceId, expense);
        return expense;
      }),
    jobs: {
      get: () =>
        jobsOnline
          ? Effect.succeed(selectedJob)
          : Effect.fail(new JobExpenseUnavailable({ code: 'job_expenses_unavailable', reason: 'Jobs offline' })),
      list: () => Effect.die('List is not used by Actions'),
    },
    legalEntityId: principal.legalEntityId,
    list: () => Effect.die('List is not used by Actions'),
    saveRecorded: save,
    voidRecorded: save,
  };
  const harness = yield* makeActionTestHarness(
    options.uncertain === true
      ? {
          actionPermission: 'allowed',
          commitAcknowledgement: 'indeterminate-once',
          services: [
            bindActionTestServices(recordJobExpenseAction, services),
            bindActionTestServices(updateJobExpenseAction, services),
            bindActionTestServices(voidJobExpenseAction, services),
          ],
        }
      : {
          actionPermission: options.denied === true ? ('denied' as const) : ('allowed' as const),
          services: [
            bindActionTestServices(recordJobExpenseAction, services),
            bindActionTestServices(updateJobExpenseAction, services),
            bindActionTestServices(voidJobExpenseAction, services),
          ],
        },
  );
  let sequence = 0;
  const transport = (key?: string) => {
    sequence += 1;
    return {
      correlationId: 'job-expenses-test',
      idempotencyKey: key ?? `expense-${sequence}`,
    };
  };
  const record = (key?: string, amountCzk = '4500.00', incurredOn = '2026-09-24') =>
    harness.runtime.runAction({
      payload: {
        amountCzk,
        category: 'WORK',
        description: 'Práce dvou pracovníků',
        incurredOn,
        serviceJobRef: selectedJob.ref,
      },
      principal,
      registration: recordJobExpenseAction,
      transport: transport(key),
    });
  const update = (expense: JobExpense, amountCzk = '4000.00') =>
    harness.runtime.runAction({
      payload: {
        amountCzk,
        category: 'DISPOSAL',
        changeReason: 'Oprava částky podle vážního lístku',
        description: 'Likvidace odpadu',
        expectedRevision: expense.revision,
        id: expense.ref.resourceId,
        incurredOn: expense.incurredOn,
      },
      principal,
      registration: updateJobExpenseAction,
      transport: transport(),
    });
  const voidExpense = (expense: JobExpense) =>
    harness.runtime.runAction({
      payload: { expectedRevision: expense.revision, id: expense.ref.resourceId, voidReason: 'Náklad patří jinam' },
      principal,
      registration: voidJobExpenseAction,
      transport: transport(),
    });
  return {
    expenses,
    harness,
    offline: () => {
      jobsOnline = false;
    },
    record,
    update,
    voidExpense,
  };
});

it.layer(
  Layer.succeed(GatewayPrincipalVerifierConfiguration, {
    configuration: Effect.die('Owner services supplied by harness'),
  }),
)('Job expense workflow', (suite) => {
  suite.effect('records, corrects and voids while retaining immutable Job and audited reasons', () =>
    Effect.gen(function* lifecycle() {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe('2026-09-24T08:00:00Z')));
      const test = yield* setup();
      const recorded = yield* test.record();
      expect(recorded).toMatchObject({
        amountCzk: '4500.00',
        costBasis: 'EXCLUDING_VAT',
        revision: 1,
        status: 'RECORDED',
      });
      expect(recorded.serviceJobRef).toEqual(job.ref);
      const updated = yield* test.update(recorded);
      expect(updated).toMatchObject({ amountCzk: '4000.00', revision: 2, status: 'RECORDED' });
      expect(updated.serviceJobRef).toEqual(recorded.serviceJobRef);
      const voided = yield* test.voidExpense(updated);
      expect(voided).toMatchObject({ amountCzk: '4000.00', revision: 3, status: 'VOIDED' });
      expect(Option.getOrNull(voided.voidReason)).toBe('Náklad patří jinam');
      expect(yield* test.update(voided).pipe(Effect.flip)).toMatchObject({ code: 'invalid_state' });
      expect(test.harness.snapshot().committed.map((entry) => entry.evidence.auditEvidence['reason'])).toEqual([
        'manual_record',
        'Oprava částky podle vážního lístku',
        'Náklad patří jinam',
      ]);
    }),
  );
  suite.effect('fails closed before writes when Jobs is unavailable and rejects future dates', () =>
    Effect.gen(function* dependencyFailure() {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe('2026-09-24T08:00:00Z')));
      const test = yield* setup();
      expect(yield* test.record(undefined, '10.00', '2026-09-25').pipe(Effect.flip)).toMatchObject({
        code: 'invalid_expense',
      });
      test.offline();
      expect(Predicate.isTagged(yield* test.record().pipe(Effect.flip), 'JobExpenseUnavailable')).toBe(true);
      expect(test.expenses.size).toBe(0);
    }),
  );
  suite.effect('records a manual expense against a completed Job', () =>
    Effect.gen(function* completedJob() {
      yield* TestClock.setTime(DateTime.toEpochMillis(DateTime.makeUnsafe('2026-09-24T08:00:00Z')));
      const test = yield* setup({ jobStatus: 'COMPLETED' });
      const recorded = yield* test.record();
      expect(recorded).toMatchObject({ status: 'RECORDED' });
      expect(recorded.serviceJobRef).toEqual(job.ref);
      expect(test.expenses.size).toBe(1);
    }),
  );
  suite.effect('preserves idempotency after uncertainty while separate identical commands remain valid', () =>
    Effect.gen(function* idempotency() {
      const test = yield* setup({ uncertain: true });
      expect(Predicate.isTagged(yield* test.record('same').pipe(Effect.flip), 'ActionCommitIndeterminate')).toBe(true);
      expect(Predicate.isTagged(yield* test.record('same').pipe(Effect.flip), 'ActionAlreadyCommitted')).toBe(true);
      expect(test.expenses.size).toBe(1);
      yield* test.record('different');
      expect(test.expenses.size).toBe(2);
    }),
  );
});
