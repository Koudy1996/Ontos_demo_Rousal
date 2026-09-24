import { Button } from '@techsio/ui-kit/atoms/button';
import type { useWorkforceController } from './use-workforce-controller.ts';

interface Props {
  readonly controller: ReturnType<typeof useWorkforceController>;
  readonly label: (key: string) => string;
}
export const WorkforceFeedback = ({ controller, label }: Props) => {
  const { dispatch, state } = controller;
  return (
    state.failure !== null && (
      <div className="workforce:mb-4" role="alert">
        <p>{label(`error.${state.failure.kind}`)}</p>
        {state.command === null && (
          <Button disabled={state.pending} onClick={() => dispatch('refresh')} size="lg">
            {label('refresh')}
          </Button>
        )}
        {state.command !== null && state.command.invocationId === undefined && (
          <Button
            disabled={state.pending}
            onClick={() => {
              if (state.command !== null) {
                controller.runCommand(state.command);
              }
            }}
            size="lg"
          >
            {label('retry')}
          </Button>
        )}
        {state.command?.invocationId !== undefined && (
          <Button disabled={state.pending} onClick={() => controller.recover()} size="lg">
            {label('resolve')}
          </Button>
        )}
      </div>
    )
  );
};
