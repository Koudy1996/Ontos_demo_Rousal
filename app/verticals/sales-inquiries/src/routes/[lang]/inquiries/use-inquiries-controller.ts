import { inquiryClientOptions } from './inquiry-client-options.ts';
import type { InquiryFormInvalid } from './inquiry-form-invalid.ts';
import { detailsCommand, transitionCommand, offerCommand } from './inquiry-commands.ts';
import { runInquiryEffect } from '../../../runtime/inquiries-runtime.ts';
import type { FetchHttpClient } from 'effect/unstable/http';
import { Effect, Schema } from 'effect';
import { useEffect, useRef, useReducer } from 'react';
import { SalesInquirySchema, InquiryIdSchema } from '../../../../shared/resources/sales-inquiry.ts';
import type {
  InquiryParty,
  InquiryStage,
  SalesInquiry as DomainSalesInquiry,
} from '../../../../shared/resources/sales-inquiry.ts';
import { executeInquiryList } from '../../../api/inquiry-list-client.ts';
import { executeInquiryDetail } from '../../../api/inquiry-detail-client.ts';
import { executePartySelection } from '../../../api/party-selection-client.ts';
import { executePartyDisplay } from '../../../api/party-display-client.ts';
import { executeInquiryCommitStatus } from '../../../api/inquiry-commit-status-client.ts';
import type { executeCreateInquiry } from '../../../api/create-inquiry-action-client.ts';
import type { executeUpdateInquiryDetails } from '../../../api/update-inquiry-details-action-client.ts';
import type { executeUpdateOfferDraft } from '../../../api/update-offer-draft-action-client.ts';
import type { executeTransitionInquiry } from '../../../api/transition-inquiry-action-client.ts';
import { inquiryCorrelation, mapInquiryFailure, withPartyRead } from './inquiries-effects.ts';
import type { InquiryUiFailure } from './inquiries-effects.ts';

import { text } from './inquiry-form-fields.tsx';

type SalesInquiry = typeof SalesInquirySchema.Encoded;
const encodeInquiry = Schema.encodeEffect(SalesInquirySchema);
type Mutation = Effect.Effect<
  DomainSalesInquiry,
  | InquiryFormInvalid
  | Effect.Error<
      | ReturnType<typeof executeCreateInquiry>
      | ReturnType<typeof executeUpdateInquiryDetails>
      | ReturnType<typeof executeUpdateOfferDraft>
      | ReturnType<typeof executeTransitionInquiry>
    >,
  FetchHttpClient.RequestInit
>;
interface PendingCommand {
  readonly effect: Mutation;
  readonly invocationId?: string;
}
interface InquiryPageState {
  command: PendingCommand | null;
  creating: boolean;
  editing: boolean;
  failure: InquiryUiFailure | null;
  loading: boolean;
  names: ReadonlyMap<string, string>;
  parties: readonly InquiryParty[];
  party: InquiryParty | null;
  pending: boolean;
  query: { readonly stage: InquiryStage | null };
  rows: readonly SalesInquiry[];
  searching: boolean;
  selected: SalesInquiry | null;
  stage: InquiryStage | null;
}
const initialPageState: InquiryPageState = {
  command: null,
  creating: false,
  editing: false,
  failure: null,
  loading: true,
  names: new Map(),
  parties: [],
  party: null,
  pending: false,
  query: { stage: null },
  rows: [],
  searching: false,
  selected: null,
  stage: null,
};
const reducePageState = (state: InquiryPageState, change: Partial<InquiryPageState> | 'refresh'): InquiryPageState =>
  change === 'refresh'
    ? { ...state, query: { ...state.query } }
    : { ...state, ...change, query: 'stage' in change ? { stage: change.stage ?? null } : state.query };

const loadInquiryPage = (stage: InquiryStage | null) =>
  inquiryCorrelation.pipe(
    Effect.flatMap((correlation) =>
      executeInquiryList(stage === null ? {} : { stage }, correlation, inquiryClientOptions()).pipe(
        Effect.flatMap(({ items }) => Effect.forEach(items, (item) => encodeInquiry(item), { concurrency: 1 })),
        Effect.map((items) => ({ items })),
      ),
    ),
    Effect.flatMap(({ items }) =>
      Effect.forEach(
        items,
        (item) =>
          inquiryCorrelation.pipe(
            Effect.flatMap((correlation) =>
              withPartyRead(executePartyDisplay({ partyRef: item.partyRef }, correlation, inquiryClientOptions())),
            ),
            Effect.map((contact) => [item.partyRef.resourceId, contact.title] as const),
          ),
        { concurrency: 3 },
      ).pipe(Effect.map((entries) => ({ entries, items }))),
    ),
  );

export const useInquiriesController = () => {
  const [state, dispatch] = useReducer(reducePageState, initialPageState);
  const { command, creating, party, pending, query, selected } = state;
  const mutationLock = useRef(false);

  useEffect(() => {
    const fiber = runInquiryEffect(
      loadInquiryPage(query.stage).pipe(
        Effect.match({
          onFailure: (error) => {
            dispatch({ failure: mapInquiryFailure(error) });
            dispatch({ loading: false });
          },
          onSuccess: ({ entries, items }) => {
            dispatch({ rows: items });
            dispatch({ names: new Map(entries) });
            dispatch({ loading: false });
          },
        }),
      ),
    );
    return () => fiber.interruptUnsafe();
  }, [query]);

  const open = (id: string) => {
    dispatch({ loading: true });
    dispatch({ failure: null });
    runInquiryEffect(
      Schema.decodeEffect(InquiryIdSchema)(id).pipe(
        Effect.flatMap((value) =>
          inquiryCorrelation.pipe(
            Effect.flatMap((correlation) =>
              executeInquiryDetail({ id: value }, correlation, inquiryClientOptions()).pipe(
                Effect.flatMap(encodeInquiry),
              ),
            ),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            dispatch({ failure: mapInquiryFailure(error) });
            dispatch({ loading: false });
          },
          onSuccess: (inquiry) => {
            dispatch({ selected: inquiry });
            dispatch({ creating: false });
            dispatch({ editing: false });
            dispatch({ loading: false });
          },
        }),
      ),
    );
  };
  const complete = (inquiry: SalesInquiry) => {
    dispatch({ command: null });
    mutationLock.current = false;
    dispatch({ pending: false });
    dispatch({ failure: null });
    dispatch({ selected: inquiry });
    dispatch({ editing: false });
    dispatch({ creating: false });
    dispatch('refresh');
  };
  const runCommand = (value: PendingCommand) => {
    if (mutationLock.current) {
      return;
    }
    mutationLock.current = true;
    dispatch({ pending: true });
    dispatch({ failure: null });
    dispatch({ command: value });
    runInquiryEffect(
      value.effect.pipe(
        Effect.flatMap(encodeInquiry),
        Effect.match({
          onFailure: (error) => {
            const mapped = mapInquiryFailure(error);
            dispatch({ failure: mapped });
            dispatch({ pending: false });
            mutationLock.current = false;
            if (mapped.kind === 'uncertain') {
              dispatch({
                command: mapped.invocationId === undefined ? value : { ...value, invocationId: mapped.invocationId },
              });
            } else if (mapped.kind === 'committed') {
              dispatch({ command: null });
              dispatch('refresh');
              open(selected?.ref.resourceId ?? mapped.invocationId ?? '');
            } else if (mapped.kind !== 'unavailable') {
              dispatch({ command: null });
            }
          },
          onSuccess: complete,
        }),
      ),
    );
  };
  const submit = (make: (key: string) => Mutation) => {
    if (mutationLock.current || command !== null) {
      return;
    }
    mutationLock.current = true;
    dispatch({ pending: true });
    runInquiryEffect(
      inquiryCorrelation.pipe(
        Effect.tap((key) =>
          Effect.sync(() => {
            mutationLock.current = false;
            runCommand({ effect: make(key) });
          }),
        ),
      ),
    );
  };
  const recover = () => {
    const invocationId = command?.invocationId;
    if (invocationId === undefined || mutationLock.current) {
      return;
    }
    mutationLock.current = true;
    dispatch({ pending: true });
    runInquiryEffect(
      Schema.decodeEffect(Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ActionInvocationId')))(
        invocationId,
      ).pipe(
        Effect.flatMap((id) =>
          inquiryCorrelation.pipe(
            Effect.flatMap((correlation) =>
              executeInquiryCommitStatus({ invocationId: id }, correlation, inquiryClientOptions()),
            ),
          ),
        ),
        Effect.match({
          onFailure: (error) => {
            mutationLock.current = false;
            dispatch({ pending: false });
            dispatch({ failure: mapInquiryFailure(error) });
          },
          onSuccess: (result) => {
            mutationLock.current = false;
            dispatch({ pending: false });
            if (result.state === 'COMMITTED') {
              dispatch({ command: null });
              dispatch({ failure: null });
              dispatch('refresh');
              open(selected?.ref.resourceId ?? invocationId);
            } else if (result.state === 'OPEN' && result.retryCommand && command !== null) {
              dispatch({ command: { effect: command.effect }, failure: { kind: 'unavailable' } });
            } else {
              dispatch({ failure: { invocationId, kind: 'uncertain' } });
            }
          },
        }),
      ),
    );
  };
  const search = (data: FormData) => {
    dispatch({ searching: true });
    dispatch({ failure: null });
    runInquiryEffect(
      inquiryCorrelation.pipe(
        Effect.flatMap((correlation) =>
          withPartyRead(executePartySelection({ query: text(data, 'query') }, correlation, inquiryClientOptions())),
        ),
        Effect.match({
          onFailure: (error) => {
            dispatch({ searching: false });
            dispatch({ failure: mapInquiryFailure(error) });
          },
          onSuccess: (items) => {
            dispatch({ parties: items });
            dispatch({ searching: false });
          },
        }),
      ),
    );
  };
  const detailsSubmit = (data: FormData) => submit((key) => detailsCommand({ creating, data, party, selected }, key));
  const changeStage = (next: 'SITE_VISIT' | 'PRICING' | 'OFFER_SENT' | 'ACCEPTED' | 'DECLINED', data?: FormData) => {
    if (selected !== null) {
      submit((key) => transitionCommand({ data, next, selected }, key));
    }
  };
  const offerSubmit = (data: FormData) => {
    if (selected !== null) {
      submit((key) => offerCommand(selected, data, key));
    }
  };
  const refresh = () => {
    dispatch('refresh');
    if (selected !== null) {
      open(selected.ref.resourceId);
    }
  };
  const locked = pending || command !== null;

  return {
    changeStage,
    detailsSubmit,
    dispatch,
    locked,
    offerSubmit,
    open,
    recover,
    refresh,
    runCommand,
    search,
    state,
  };
};
