import assert from 'node:assert/strict';

// Minimal Jest-style matchers on top of node:assert, used with node:test.
export function expect(actual: unknown) {
  return {
    toBe: (expected: unknown) => assert.equal(actual, expected),
    toEqual: (expected: unknown) => assert.deepEqual(actual, expected),
    toHaveLength: (length: number) => assert.equal((actual as { length: number }).length, length),
    toThrow: () => assert.throws(actual as () => unknown),
  };
}
