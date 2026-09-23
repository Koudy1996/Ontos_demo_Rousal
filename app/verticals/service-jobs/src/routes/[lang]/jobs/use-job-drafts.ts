import { useState } from 'react';
import type { ServiceJobSchema } from '../../../../shared/resources/service-job.ts';
import { localInput } from './job-view.ts';

type Job = typeof ServiceJobSchema.Encoded;
const draftsFor = (job: Job) => ({
  execution: { checklist: job.checklist, executionNote: job.executionNote },
  revision: job.revision,
  schedule: {
    expectedDurationMinutes: String(job.expectedDurationMinutes ?? ''),
    localStart: localInput(job.scheduledStartAt),
  },
});
const retainDirty = <A>(draft: A, previous: A, current: A): A => (draft === previous ? current : draft);

export const useJobDrafts = (job: Job) => {
  const current = draftsFor(job);
  const [state, setState] = useState({ base: current, ...current });
  if (state.revision !== job.revision) {
    const previous = state.base;
    const { checklist } = state.execution;
    setState({
      base: current,
      execution: {
        checklist: {
          accessChecked: retainDirty(
            checklist.accessChecked,
            previous.execution.checklist.accessChecked,
            current.execution.checklist.accessChecked,
          ),
          cleared: retainDirty(
            checklist.cleared,
            previous.execution.checklist.cleared,
            current.execution.checklist.cleared,
          ),
          handedOver: retainDirty(
            checklist.handedOver,
            previous.execution.checklist.handedOver,
            current.execution.checklist.handedOver,
          ),
          wasteRemoved: retainDirty(
            checklist.wasteRemoved,
            previous.execution.checklist.wasteRemoved,
            current.execution.checklist.wasteRemoved,
          ),
        },
        executionNote: retainDirty(
          state.execution.executionNote,
          previous.execution.executionNote,
          current.execution.executionNote,
        ),
      },
      revision: job.revision,
      schedule: {
        expectedDurationMinutes: retainDirty(
          state.schedule.expectedDurationMinutes,
          previous.schedule.expectedDurationMinutes,
          current.schedule.expectedDurationMinutes,
        ),
        localStart: retainDirty(state.schedule.localStart, previous.schedule.localStart, current.schedule.localStart),
      },
    });
  }
  return {
    executionDraft: job.status === 'COMPLETED' ? current.execution : state.execution,
    scheduleDraft: state.schedule,
    setChecklist: (name: keyof Job['checklist'], checked: boolean) =>
      setState((previous) => ({
        ...previous,
        execution: { ...previous.execution, checklist: { ...previous.execution.checklist, [name]: checked } },
      })),
    setExecutionNote: (executionNote: string) =>
      setState((previous) => ({ ...previous, execution: { ...previous.execution, executionNote } })),
    setScheduleDraft: (change: Partial<typeof current.schedule>) =>
      setState((previous) => ({ ...previous, schedule: { ...previous.schedule, ...change } })),
  };
};
