import { Effect } from 'effect';
import { useEffect, useReducer, useRef } from 'react';
import type { DashboardOverviewResponse } from '../../../../shared/apis/dashboard-overview.ts';
import { executeDashboardOverview } from '../../../api/dashboard-overview-client.ts';
import { runOperationsDashboardEffect } from '../../../runtime/operations-dashboard-runtime.ts';
import { operationsDashboardClientOptions } from './operations-dashboard-client-options.ts';
import type { DashboardUiFailure } from './operations-dashboard-effects.ts';
import { dashboardCorrelation, mapDashboardFailure } from './operations-dashboard-effects.ts';

interface State {
  readonly data: DashboardOverviewResponse | null;
  readonly error: DashboardUiFailure | null;
  readonly loading: boolean;
  readonly refresh: number;
}
const initial: State = { data: null, error: null, loading: true, refresh: 0 };
const reducer = (state: State, patch: Partial<State>): State => ({ ...state, ...patch });

export const useDashboardController = () => {
  const [state, dispatch] = useReducer(reducer, initial);
  const generation = useRef(0);
  const { refresh } = state;

  useEffect(() => {
    const current = Math.max(generation.current + 1, refresh + 1);
    generation.current = current;
    dispatch({ error: null, loading: true });
    const fiber = runOperationsDashboardEffect(
      dashboardCorrelation.pipe(
        Effect.flatMap((correlation) => executeDashboardOverview({}, correlation, operationsDashboardClientOptions())),
        Effect.match({
          onFailure: (error) => {
            if (current === generation.current) {
              dispatch({ error: mapDashboardFailure(error), loading: false });
            }
          },
          onSuccess: (data) => {
            if (current === generation.current) {
              dispatch({ data, error: null, loading: false });
            }
          },
        }),
      ),
    );
    return () => {
      generation.current += 1;
      fiber.interruptUnsafe();
    };
  }, [refresh]);

  return {
    refresh: () => dispatch({ refresh: state.refresh + 1 }),
    state,
  };
};
