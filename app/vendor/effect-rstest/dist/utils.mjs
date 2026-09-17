import { assert } from "@rstest/core";
import * as Exit from "effect/Exit";
import * as Predicate from "effect/Predicate";
import * as Equal from "effect/Equal";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as assert$1 from "node:assert";
//#region src/utils.ts
/**
* Fails the current test with the provided error message.
*
* @category testing
* @since 0.1.0
*/
function fail(message) {
	assert$1.fail(message);
}
/**
* Asserts that `actual` is deeply strictly equal to `expected` using Node's `assert.deepStrictEqual`.
*
* @category testing
* @since 0.1.0
*/
function deepStrictEqual(actual, expected, message, ..._) {
	assert$1.deepStrictEqual(actual, expected, message);
}
/**
* Asserts that `actual` is not deeply strictly equal to `expected` using Node's `assert.notDeepStrictEqual`.
*
* @category testing
* @since 0.1.0
*/
function notDeepStrictEqual(actual, expected, message, ..._) {
	assert$1.notDeepStrictEqual(actual, expected, message);
}
/**
* Asserts that `actual` is strictly equal to `expected` using Node's `assert.strictEqual`.
*
* @category testing
* @since 0.1.0
*/
function strictEqual(actual, expected, message, ..._) {
	if (message !== void 0) assert$1.strictEqual(actual, expected, message);
	else assert$1.strictEqual(actual, expected);
}
/**
* Asserts that `actual` is equal to `expected` using the `Equal.equals` trait.
*
* @category testing
* @since 0.1.0
*/
function assertEquals(actual, expected, message, ..._) {
	if (!Equal.equals(actual, expected)) {
		deepStrictEqual(actual, expected, message);
		fail(message ?? "Expected values to be Equal.equals");
	}
}
/**
* Asserts that `thunk` does not throw an error.
*
* @category testing
* @since 0.1.0
*/
function doesNotThrow(thunk, message, ..._) {
	assert$1.doesNotThrow(thunk, message);
}
/**
* Asserts that `value` is an instance of `constructor`.
*
* @category testing
* @since 0.1.0
*/
function assertInstanceOf(value, constructor, message, ..._) {
	assert.instanceOf(value, constructor, message);
}
/**
* Asserts that `self` is `true`.
*
* @category testing
* @since 0.1.0
*/
function assertTrue(self, message, ..._) {
	strictEqual(self, true, message);
}
/**
* Asserts that `self` is `false`.
*
* @category testing
* @since 0.1.0
*/
function assertFalse(self, message, ..._) {
	strictEqual(self, false, message);
}
/**
* Asserts that `actual` includes `expected`.
*
* @category testing
* @since 0.1.0
*/
function assertInclude(actual, expected, ..._) {
	if (typeof expected === "string") {
		if (!actual?.includes(expected)) fail(`Expected\n\n${actual}\n\nto include\n\n${expected}`);
	}
}
/**
* Asserts that `actual` matches `regExp`.
*
* @category testing
* @since 0.1.0
*/
function assertMatch(actual, regExp, ..._) {
	if (!regExp.test(actual)) fail(`Expected\n\n${actual}\n\nto match\n\n${regExp}`);
}
/**
* Asserts that `thunk` throws, optionally checking the thrown value against an expected `Error` or validation function.
*
* @category testing
* @since 0.1.0
*/
function throws(thunk, error, ..._) {
	try {
		thunk();
	} catch (e) {
		if (error !== void 0) {
			if (Predicate.isFunction(error)) error(e);
			else if (error) deepStrictEqual(e, error);
			else throw e;
		}
		return;
	}
	fail("Expected to throw an error");
}
/**
* Asserts that `thunk` throws or returns a rejected promise, optionally checking the failure value against an expected `Error` or validation function.
*
* @category testing
* @since 0.1.0
*/
async function throwsAsync(thunk, error, ..._) {
	try {
		await thunk();
	} catch (e) {
		if (error !== void 0) {
			if (Predicate.isFunction(error)) error(e);
			else deepStrictEqual(e, error);
		}
		return;
	}
	fail("Expected to throw an error");
}
/**
* Asserts that `option` is `None`.
*
* @category testing
* @since 0.1.0
*/
function assertNone(option, ..._) {
	deepStrictEqual(option, Option.none());
}
/**
* Asserts that `a` is not `undefined`.
*
* @category testing
* @since 0.1.0
*/
function assertDefined(a, ..._) {
	if (a === void 0) fail("Expected value to be defined");
}
/**
* Asserts that `a` is `undefined`.
*
* @category testing
* @since 0.1.0
*/
function assertUndefined(a, ..._) {
	if (a !== void 0) fail("Expected value to be undefined");
}
/**
* Asserts that `option` is `Some` and contains a value equal to `expected`.
*
* @category testing
* @since 0.1.0
*/
function assertSome(option, expected, ..._) {
	deepStrictEqual(option, Option.some(expected));
}
/**
* Asserts that `result` is `Success` and contains a value equal to `expected`.
*
* @category testing
* @since 0.1.0
*/
function assertSuccess(result, expected, ..._) {
	deepStrictEqual(result, Result.succeed(expected));
}
/**
* Asserts that `result` is `Failure` and contains an error equal to `expected`.
*
* @category testing
* @since 0.1.0
*/
function assertFailure(result, expected, ..._) {
	deepStrictEqual(result, Result.fail(expected));
}
/**
* Asserts that `exit` is a failure with a cause equal to `expected`.
*
* @category testing
* @since 0.1.0
*/
function assertExitFailure(exit, expected, ..._) {
	deepStrictEqual(exit, Exit.failCause(expected));
}
/**
* Asserts that `exit` is a success with a value equal to `expected`.
*
* @category testing
* @since 0.1.0
*/
function assertExitSuccess(exit, expected, ..._) {
	deepStrictEqual(exit, Exit.succeed(expected));
}
//#endregion
export { assertDefined, assertEquals, assertExitFailure, assertExitSuccess, assertFailure, assertFalse, assertInclude, assertInstanceOf, assertMatch, assertNone, assertSome, assertSuccess, assertTrue, assertUndefined, deepStrictEqual, doesNotThrow, fail, notDeepStrictEqual, strictEqual, throws, throwsAsync };
