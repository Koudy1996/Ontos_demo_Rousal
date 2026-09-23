import { Context, Effect, Layer, Schema } from 'effect';
import { HttpApiBuilder, HttpRouter, HttpServer } from '@modern-js/bff-effect/effect-edge';
import { expect, it } from 'effect-rstest';
import { InquiryListApi } from '../../shared/apis/inquiry-list.ts';
import { inquiryListRead } from '../../src/api/inquiry-list.read.ts';

it.effect('round trips absent and selected filters through HTTP and governed input; rejects invalid stage', () =>
  Effect.gen(function* listTransport() {
    const seen: (string | undefined)[] = [];
    const capture = (input: typeof inquiryListRead.descriptor.inputSchema.Type) =>
      Effect.sync(() => {
        seen.push(input.stage);
      });
    const handlers = HttpApiBuilder.group(InquiryListApi, 'inquiryList', (builder) =>
      builder.handle('execute', ({ payload }) =>
        Schema.decodeEffect(inquiryListRead.descriptor.inputSchema)(payload).pipe(
          Effect.tap(capture),
          Effect.as({ items: [] }),
          Effect.orDie,
        ),
      ),
    );
    const server = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(
          HttpApiBuilder.layer(InquiryListApi).pipe(Layer.provide(handlers), Layer.provide(HttpServer.layerServices)),
          { disableLogger: true },
        ),
      ),
      (handler) => Effect.promise(() => handler.dispose()),
    );
    for (const [body, status] of [
      ['{}', 200],
      ['{"stage":"PRICING"}', 200],
      ['{"stage":"UNKNOWN"}', 400],
    ] as const) {
      const response = yield* Effect.promise(() =>
        server.handler(
          new Request('https://sales.test/reads/inquiry-list', {
            body,
            headers: { 'content-type': 'application/json' },
            method: 'POST',
          }),
          Context.empty(),
        ),
      );
      expect(response.status).toBe(status);
    }
    expect(seen).toEqual([undefined, 'PRICING']);
  }),
);
