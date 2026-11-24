/**
 * Tiny test harness for gjs. Test files import `test` and `assert` from here;
 * tests/run.js collects and runs them.
 */

/** @type {{file: string, name: string, fn: Function}[]} */
export const registeredTests = [];

let currentFile = '';

/** @param {string} file */
export function setCurrentFile(file) {
    currentFile = file;
}

/**
 * Registers a test. `fn` may be async.
 *
 * @param {string} name
 * @param {Function} fn
 */
export function test(name, fn) {
    registeredTests.push({file: currentFile, name, fn});
}

export class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssertionError';
    }
}

function show(value) {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function isDeepEqual(a, b) {
    if (Object.is(a, b))
        return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
        return false;
    if (Array.isArray(a) !== Array.isArray(b))
        return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length)
        return false;
    return keysA.every(k => Object.hasOwn(b, k) && isDeepEqual(a[k], b[k]));
}

export const assert = {
    ok(value, message = `expected a truthy value, got ${show(value)}`) {
        if (!value)
            throw new AssertionError(message);
    },

    equal(actual, expected, message) {
        if (!Object.is(actual, expected))
            throw new AssertionError(message ?? `expected ${show(expected)}, got ${show(actual)}`);
    },

    deepEqual(actual, expected, message) {
        if (!isDeepEqual(actual, expected))
            throw new AssertionError(message ?? `expected ${show(expected)}, got ${show(actual)}`);
    },

    /**
     * @param {Function} fn - expected to throw
     * @param {Function|RegExp} [expected] - error class, or pattern for the message
     */
    throws(fn, expected) {
        try {
            fn();
        } catch (e) {
            if (expected instanceof RegExp && !expected.test(e?.message))
                throw new AssertionError(`error message ${show(e?.message)} does not match ${expected}`);
            if (typeof expected === 'function' && !(e instanceof expected))
                throw new AssertionError(`expected ${expected.name}, got ${e?.name}`);
            return;
        }
        throw new AssertionError('expected function to throw');
    },
};
