import * as Rs from "@rstest/core";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import { flow, pipe } from "effect/Function";
import * as Layer from "effect/Layer";
import { isObject } from "effect/Predicate";
import * as Rec from "effect/Record";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as fc from "effect/testing/FastCheck";
import * as TestClock from "effect/testing/TestClock";
import * as TestConsole from "effect/testing/TestConsole";
export * from "@rstest/core";
//#region src/internal/internal.ts
/**
* @since 0.1.0
*/
const runPromise = Effect.fnUntraced(function* (effect, _ctx) {
	const exit = yield* Effect.exit(effect);
	if (Exit.isFailure(exit)) {
		const errors = Cause.prettyErrors(exit.cause);
		for (let i = 0; i < errors.length; i++) yield* Effect.logError(errors[i]);
	}
	return yield* exit;
}, (effect, _, ctx) => Effect.runPromise(effect, { signal: ctx?.signal }));
/** @internal */
const runTest = (ctx) => (effect) => {
	let settlement;
	ctx?.onTestFinished(() => settlement, 0);
	const result = runPromise(effect, ctx);
	settlement = result.then(() => {}, () => {});
	return result;
};
const TestEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer());
/** @internal */
const addEqualityTesters$1 = () => {
	Rs.expect.addEqualityTesters([(a, b) => Equal.isEqual(a) && Equal.isEqual(b) ? Equal.equals(a, b) : void 0]);
};
/** @internal */
const testOptions = (timeout) => typeof timeout === "number" ? { timeout } : timeout ?? {};
const hookTimeout = (timeout) => timeout === void 0 ? void 0 : Duration.toMillis(Duration.fromInputUnsafe(timeout));
const makeItProxy = (it, overrides) => new Proxy(it, {
	apply(target, thisArg, argArray) {
		return Reflect.apply(target, thisArg, argArray);
	},
	get(target, property, receiver) {
		if (Object.hasOwn(overrides, property)) return Reflect.get(overrides, property);
		return Reflect.get(target, property, receiver);
	}
});
/** @internal */
const makeTester = (mapEffect, it = Rs.it) => {
	const run = (ctx, args, self) => pipe(Effect.suspend(() => self(...args)), mapEffect, Effect.asVoid, runTest(ctx));
	const f = (name, self, timeout) => it(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self));
	const skip = (name, self, timeout) => it.skip(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self));
	const skipIf = (condition) => (name, self, timeout) => it.skipIf(Boolean(condition))(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self));
	const runIf = (condition) => (name, self, timeout) => it.runIf(Boolean(condition))(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self));
	const only = (name, self, timeout) => it.only(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self));
	const each = (cases) => (name, self, timeout) => it.for(cases)(name, testOptions(timeout), (args, ctx) => run(ctx, [args], self));
	const fails = (name, self, timeout) => it.fails(name, testOptions(timeout), (ctx) => run(ctx, [ctx], self));
	const prop = (name, arbitraries, self, timeout) => {
		if (Array.isArray(arbitraries)) {
			const arbs = arbitraries.map((arbitrary) => {
				if (Schema.isSchema(arbitrary)) return Schema.toArbitrary(arbitrary)(fc);
				return arbitrary;
			});
			return it(name, testOptions(timeout), (ctx) => fc.assert(fc.asyncProperty(...arbs, (...as) => run(ctx, [as, ctx], self)), isObject(timeout) ? timeout?.fastCheck : {}));
		}
		const arbs = fc.record(Object.keys(arbitraries).reduce(function(result, key) {
			const arb = arbitraries[key];
			Rec.assignProperty(result, key, Schema.isSchema(arb) ? Schema.toArbitrary(arb)(fc) : arb);
			return result;
		}, {}));
		return it(name, testOptions(timeout), (ctx) => fc.assert(fc.asyncProperty(arbs, (...as) => run(ctx, [as[0], ctx], self)), isObject(timeout) ? timeout?.fastCheck : {}));
	};
	return Object.assign(f, {
		skip,
		skipIf,
		runIf,
		only,
		each,
		fails,
		prop
	});
};
/** @internal */
const prop$1 = (name, arbitraries, self, timeout) => {
	if (Array.isArray(arbitraries)) {
		const arbs = arbitraries.map((arbitrary) => {
			if (Schema.isSchema(arbitrary)) return Schema.toArbitrary(arbitrary)(fc);
			return arbitrary;
		});
		return Rs.it(name, testOptions(timeout), (ctx) => fc.assert(fc.property(...arbs, (...as) => self(as, ctx)), isObject(timeout) ? timeout?.fastCheck : {}));
	}
	const arbs = fc.record(Object.keys(arbitraries).reduce(function(result, key) {
		const arb = arbitraries[key];
		Rec.assignProperty(result, key, Schema.isSchema(arb) ? Schema.toArbitrary(arb)(fc) : arb);
		return result;
	}, {}));
	return Rs.it(name, testOptions(timeout), (ctx) => fc.assert(fc.property(arbs, (as) => self(as, ctx)), isObject(timeout) ? timeout?.fastCheck : {}));
};
/** @internal */
const layer$1 = (layer_, options) => (...args) => {
	const excludeTestServices = options?.excludeTestServices ?? false;
	const withTestEnv = excludeTestServices ? layer_ : Layer.provideMerge(layer_, TestEnv);
	const memoMap = options?.memoMap ?? Effect.runSync(Layer.makeMemoMap);
	const scope = Effect.runSync(Scope.make());
	const contextEffect = Layer.buildWithMemoMap(withTestEnv, memoMap, scope).pipe(Effect.orDie, Effect.cached, Effect.runSync);
	let setupFiber;
	const buildContext = () => runPromise(Effect.withFiber((fiber) => {
		setupFiber = fiber;
		return Effect.asVoid(contextEffect);
	}));
	let closed = false;
	const closeScope = (ctx) => {
		if (closed) return Promise.resolve();
		closed = true;
		return runPromise(Effect.andThen(setupFiber !== void 0 ? Fiber.interrupt(setupFiber) : Effect.void, Scope.close(scope, Exit.void)), ctx);
	};
	const makeIt = (it) => makeItProxy(it, {
		effect: makeTester((effect) => Effect.flatMap(contextEffect, (context) => effect.pipe(Effect.scoped, Effect.provide(context))), it),
		describe: Rs.describe,
		prop: prop$1,
		flakyTest: flakyTest$1,
		layer(nestedLayer, options) {
			return layer$1(Layer.provideMerge(nestedLayer, withTestEnv), {
				...options,
				memoMap: Layer.forkMemoMapUnsafe(memoMap),
				excludeTestServices
			});
		}
	});
	if (args.length === 1) return Rs.describe("", () => {
		Rs.beforeAll(buildContext, hookTimeout(options?.timeout));
		Rs.afterAll(() => closeScope(), hookTimeout(options?.timeout));
		return args[0](makeIt(Rs.it));
	});
	return Rs.describe(args[0], () => {
		Rs.beforeAll(buildContext, hookTimeout(options?.timeout));
		Rs.afterAll(() => closeScope(), hookTimeout(options?.timeout));
		return args[1](makeIt(Rs.it));
	});
};
/** @internal */
const flakyTest$1 = (self, timeout = Duration.seconds(30)) => pipe(self, Effect.scoped, Effect.sandbox, Effect.retry(pipe(Schedule.recurs(10), Schedule.while((_) => Effect.succeed(Duration.isLessThanOrEqualTo(Duration.fromInputUnsafe(_.elapsed), Duration.fromInputUnsafe(timeout)))))), Effect.orDie);
/** @internal */
const makeMethods$1 = (it) => makeItProxy(it, {
	effect: makeTester(flow(Effect.scoped, Effect.provide(TestEnv)), it),
	live: makeTester(Effect.scoped, it),
	describe: Rs.describe,
	flakyTest: flakyTest$1,
	layer: layer$1,
	prop: prop$1
});
/** @internal */
const { effect: effect$1, live: live$1 } = makeMethods$1(Rs.it);
/** @internal */
const describeWrapped$1 = (name, f) => Rs.describe(name, () => f(makeMethods$1(Rs.it)));
//#endregion
//#region src/index.ts
/**
* @since 0.1.0
*/
const addEqualityTesters = addEqualityTesters$1;
/**
* @since 0.1.0
*/
const effect = effect$1;
/**
* @since 0.1.0
*/
const live = live$1;
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
const layer = layer$1;
/**
* @since 0.1.0
*/
const flakyTest = flakyTest$1;
/**
* @since 0.1.0
*/
const prop = prop$1;
/**
* @since 0.1.0
*/
const it = makeMethods$1(Rs.it);
/**
* @since 0.1.0
*/
const makeMethods = makeMethods$1;
/**
* Unlike `@effect/vitest`, this returns `void` because Rstest's `describe`
* does not return a `SuiteCollector`.
*
* @since 0.1.0
*/
const describeWrapped = describeWrapped$1;
//#endregion
export { addEqualityTesters, describeWrapped, effect, flakyTest, it, layer, live, makeMethods, prop };
