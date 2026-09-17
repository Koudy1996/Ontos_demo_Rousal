import * as Cause from "effect/Cause";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
//#region src/utils.d.ts
/**
 * Fails the current test with the provided error message.
 *
 * @category testing
 * @since 0.1.0
 */
declare function fail(message: string): void;
/**
 * Asserts that `actual` is deeply strictly equal to `expected` using Node's `assert.deepStrictEqual`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function deepStrictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>): void;
/**
 * Asserts that `actual` is not deeply strictly equal to `expected` using Node's `assert.notDeepStrictEqual`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function notDeepStrictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>): void;
/**
 * Asserts that `actual` is strictly equal to `expected` using Node's `assert.strictEqual`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function strictEqual<A>(actual: A, expected: A, message?: string, ..._: Array<never>): void;
/**
 * Asserts that `actual` is equal to `expected` using the `Equal.equals` trait.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertEquals<A>(actual: A, expected: A, message?: string, ..._: Array<never>): void;
/**
 * Asserts that `thunk` does not throw an error.
 *
 * @category testing
 * @since 0.1.0
 */
declare function doesNotThrow(thunk: () => void, message?: string, ..._: Array<never>): void;
/**
 * Asserts that `value` is an instance of `constructor`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertInstanceOf<C extends abstract new (...args: any) => any>(value: unknown, constructor: C, message?: string, ..._: Array<never>): asserts value is InstanceType<C>;
/**
 * Asserts that `self` is `true`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertTrue(self: unknown, message?: string, ..._: Array<never>): asserts self;
/**
 * Asserts that `self` is `false`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertFalse(self: boolean, message?: string, ..._: Array<never>): void;
/**
 * Asserts that `actual` includes `expected`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertInclude(actual: string | undefined, expected: string, ..._: Array<never>): void;
/**
 * Asserts that `actual` matches `regExp`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertMatch(actual: string, regExp: RegExp, ..._: Array<never>): void;
/**
 * Asserts that `thunk` throws, optionally checking the thrown value against an expected `Error` or validation function.
 *
 * @category testing
 * @since 0.1.0
 */
declare function throws(thunk: () => void, error?: Error | ((u: unknown) => undefined), ..._: Array<never>): void;
/**
 * Asserts that `thunk` throws or returns a rejected promise, optionally checking the failure value against an expected `Error` or validation function.
 *
 * @category testing
 * @since 0.1.0
 */
declare function throwsAsync(thunk: () => Promise<void>, error?: Error | ((u: unknown) => undefined), ..._: Array<never>): Promise<void>;
/**
 * Asserts that `option` is `None`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertNone<A>(option: Option.Option<A>, ..._: Array<never>): asserts option is Option.None<never>;
/**
 * Asserts that `a` is not `undefined`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertDefined<A>(a: A | undefined, ..._: Array<never>): asserts a is Exclude<A, undefined>;
/**
 * Asserts that `a` is `undefined`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertUndefined<A>(a: A | undefined, ..._: Array<never>): asserts a is undefined;
/**
 * Asserts that `option` is `Some` and contains a value equal to `expected`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertSome<A>(option: Option.Option<A>, expected: A, ..._: Array<never>): asserts option is Option.Some<A>;
/**
 * Asserts that `result` is `Success` and contains a value equal to `expected`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertSuccess<A, E>(result: Result.Result<A, E>, expected: A, ..._: Array<never>): asserts result is Result.Success<A, never>;
/**
 * Asserts that `result` is `Failure` and contains an error equal to `expected`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertFailure<A, E>(result: Result.Result<A, E>, expected: E, ..._: Array<never>): asserts result is Result.Failure<never, E>;
/**
 * Asserts that `exit` is a failure with a cause equal to `expected`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertExitFailure<A, E>(exit: Exit.Exit<A, E>, expected: Cause.Cause<E>, ..._: Array<never>): asserts exit is Exit.Failure<never, E>;
/**
 * Asserts that `exit` is a success with a value equal to `expected`.
 *
 * @category testing
 * @since 0.1.0
 */
declare function assertExitSuccess<A, E>(exit: Exit.Exit<A, E>, expected: A, ..._: Array<never>): asserts exit is Exit.Success<A, never>;
//#endregion
export { assertDefined, assertEquals, assertExitFailure, assertExitSuccess, assertFailure, assertFalse, assertInclude, assertInstanceOf, assertMatch, assertNone, assertSome, assertSuccess, assertTrue, assertUndefined, deepStrictEqual, doesNotThrow, fail, notDeepStrictEqual, strictEqual, throws, throwsAsync };