import { expect, it } from 'effect-rstest';
import { DateTime, Result, Schema } from 'effect';
import { JobListRequestSchema } from '../../shared/apis/job-list.ts';
import { jobListRead } from '../../src/api/job-list.read.ts';

const decode = Schema.decodeUnknownResult(JobListRequestSchema);
it('old list callers remain valid and bounded schedule queries reject ambiguous or empty inputs', () => {
  expect(Result.isSuccess(decode({}))).toBe(true);
  expect(Result.isSuccess(decode({ view: 'UPCOMING' }))).toBe(true);
  expect(Result.isSuccess(decode({ selection: { references: [] } }))).toBe(false);
  const interval = { from: '2026-10-04T22:00:00Z', to: '2026-10-11T22:00:00Z' };
  expect(Result.isSuccess(decode({ selection: { interval, references: [] } }))).toBe(true);
  // HTTP decodes timestamps; the real governed read must validate those decoded
  // DateTime values without attempting the wire decoding a second time.
  const decoded = Result.getOrThrow(decode({ selection: { interval, references: [] } }));
  const validateRead = Schema.decodeUnknownResult(jobListRead.descriptor.inputSchema);
  expect(Result.getOrThrow(validateRead(decoded))).toEqual(decoded);
  for (const to of ['2026-10-04T22:00:00Z', '2026-11-11T22:00:00Z']) {
    expect(
      Result.isFailure(
        validateRead({
          selection: {
            interval: { from: DateTime.makeUnsafe(interval.from), to: DateTime.makeUnsafe(to) },
            references: [],
          },
        }),
      ),
    ).toBe(true);
  }
  for (const [from, to] of [
    ['2026-02-30T00:00:00Z', '2026-03-03T00:00:00Z'],
    ['10/05/2026Z', '2026-10-06T00:00:00Z'],
    ['2026-10-05T24:00:00Z', '2026-10-07T00:00:00Z'],
    ['2026-10-05T00:00:00+02:00', '2026-10-06T00:00:00Z'],
  ]) {
    expect(Result.isFailure(decode({ selection: { interval: { from, to }, references: [] } }))).toBe(true);
  }
  expect(Result.isSuccess(decode({ selection: { interval, references: [] }, view: 'ALL' }))).toBe(false);
  expect(
    Result.isSuccess(decode({ selection: { interval: { ...interval, to: '2026-10-04T22:00:00Z' }, references: [] } })),
  ).toBe(false);
  expect(
    Result.isSuccess(decode({ selection: { interval: { ...interval, to: '2026-11-11T22:00:00Z' }, references: [] } })),
  ).toBe(false);
});
