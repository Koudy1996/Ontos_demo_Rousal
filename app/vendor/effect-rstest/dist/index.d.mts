import * as Rs from "@rstest/core";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as FC from "effect/testing/FastCheck";
export * from "@rstest/core";
//#region src/index.d.ts
/**
 * @since 0.1.0
 */
type API = Rs.TestAPIs;
/**
 * Type namespace retained from `@effect/vitest` for source compatibility.
 *
 * @since 0.1.0
 */
declare namespace Vitest {
  /**
   * @since 0.1.0
   */
  interface TestFunction<A, E, R, TestArgs extends Array<any>> {
    (...args: TestArgs): Effect.Effect<A, E, R>;
  }
  /**
   * @since 0.1.0
   */
  interface Test<R> {
    <A, E>(name: string, self: TestFunction<A, E, R, [Rs.TestContext]>, timeout?: number | Rs.TestOptions): void;
  }
  /**
   * @since 0.1.0
   */
  type Arbitraries = Array<Schema.Schema<any> | FC.Arbitrary<any>> | { [K in string]: Schema.Schema<any> | FC.Arbitrary<any>; };
  /**
   * @since 0.1.0
   */
  interface Tester<R> extends Vitest.Test<R> {
    skip: Vitest.Test<R>;
    skipIf: (condition: unknown) => Vitest.Test<R>;
    runIf: (condition: unknown) => Vitest.Test<R>;
    only: Vitest.Test<R>;
    each: <T>(cases: ReadonlyArray<T>) => <A, E>(name: string, self: TestFunction<A, E, R, Array<T>>, timeout?: number | Rs.TestOptions) => void;
    fails: Vitest.Test<R>;
    /**
     * @since 0.1.0
     */
    prop: <const Arbs extends Arbitraries, A, E>(name: string, arbitraries: Arbs, self: TestFunction<A, E, R, [{ [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T : never; }, Rs.TestContext]>, timeout?: number | Rs.TestOptions & {
      fastCheck?: FC.Parameters<{ [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T : never; }>;
    }) => void;
  }
  /**
   * @since 0.1.0
   */
  interface MethodsNonLive<R = never> extends API {
    readonly effect: Vitest.Tester<R | Scope.Scope>;
    readonly describe: Rs.Describe;
    readonly flakyTest: <A, E, R2>(self: Effect.Effect<A, E, R2 | Scope.Scope>, timeout?: Duration.Input) => Effect.Effect<A, never, R2>;
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly timeout?: Duration.Input;
    }) => {
      (f: (it: Vitest.MethodsNonLive<R | R2>) => void): void;
      (name: string, f: (it: Vitest.MethodsNonLive<R | R2>) => void): void;
    };
    /**
     * @since 0.1.0
     */
    readonly prop: <const Arbs extends Arbitraries>(name: string, arbitraries: Arbs, self: (properties: { [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T : never; }, ctx: Rs.TestContext) => void, timeout?: number | Rs.TestOptions & {
      fastCheck?: FC.Parameters<{ [K in keyof Arbs]: Arbs[K] extends FC.Arbitrary<infer T> ? T : Arbs[K] extends Schema.Schema<infer T> ? T : never; }>;
    }) => void;
  }
  /**
   * @since 0.1.0
   */
  interface Methods<R = never> extends MethodsNonLive<R> {
    readonly live: Vitest.Tester<Scope.Scope | R>;
    readonly layer: <R2, E>(layer: Layer.Layer<R2, E, R>, options?: {
      readonly memoMap?: Layer.MemoMap;
      readonly timeout?: Duration.Input;
      readonly excludeTestServices?: boolean;
    }) => {
      (f: (it: Vitest.MethodsNonLive<R | R2>) => void): void;
      (name: string, f: (it: Vitest.MethodsNonLive<R | R2>) => void): void;
    };
  }
}
/**
 * @since 0.1.0
 */
declare const addEqualityTesters: () => void;
/**
 * @since 0.1.0
 */
declare const effect: Vitest.Tester<Scope.Scope>;
/**
 * @since 0.1.0
 */
declare const live: Vitest.Tester<Scope.Scope>;
/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * @since 0.1.0
 *
 * ```ts
 * import { assert, layer } from "effect-rstest"
 * import { Effect, Layer, Context } from "effect"
 *
 * class Foo extends Context.Service<Foo, "foo">()("Foo") {
 *   static layer = Layer.succeed(Foo, "foo")
 * }
 *
 * class Bar extends Context.Service<Bar, "bar">()("Bar") {
 *   static layer = Layer.effect(
 *     Bar,
 *     Effect.map(Foo, () => "bar" as const)
 *   )
 * }
 *
 * layer(Foo.layer)("layer", (it) => {
 *   it.effect("adds context", () =>
 *     Effect.gen(function*() {
 *       const foo = yield* Foo
 *       assert.strictEqual(foo, "foo")
 *     }))
 *
 *   it.layer(Bar.layer)("nested", (it) => {
 *     it.effect("adds context", () =>
 *       Effect.gen(function*() {
 *         const foo = yield* Foo
 *         const bar = yield* Bar
 *         assert.strictEqual(foo, "foo")
 *         assert.strictEqual(bar, "bar")
 *       }))
 *   })
 * })
 * ```
 */
declare const layer: <R, E>(layer_: Layer.Layer<R, E>, options?: {
  readonly memoMap?: Layer.MemoMap;
  readonly timeout?: Duration.Input;
  readonly excludeTestServices?: boolean;
}) => {
  (f: (it: Vitest.MethodsNonLive<R>) => void): void;
  (name: string, f: (it: Vitest.MethodsNonLive<R>) => void): void;
};
/**
 * @since 0.1.0
 */
declare const flakyTest: <A, E, R>(self: Effect.Effect<A, E, R | Scope.Scope>, timeout?: Duration.Input) => Effect.Effect<A, never, R>;
/**
 * @since 0.1.0
 */
declare const prop: Vitest.Methods["prop"];
/**
 * @since 0.1.0
 */
declare const it: Vitest.Methods;
/**
 * @since 0.1.0
 */
declare const makeMethods: (it: Rs.TestAPIs) => Vitest.Methods;
/**
 * Unlike `@effect/vitest`, this returns `void` because Rstest's `describe`
 * does not return a `SuiteCollector`.
 *
 * @since 0.1.0
 */
declare const describeWrapped: (name: string, f: (it: Vitest.Methods) => void) => void;
//#endregion
export { API, Vitest, addEqualityTesters, describeWrapped, effect, flakyTest, it, layer, live, makeMethods, prop };