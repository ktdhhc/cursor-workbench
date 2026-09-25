import test from 'node:test';
import assert from 'node:assert/strict';
import { greet, sum } from '../src/hello.js';

test('greets a developer by name', () => {
  assert.equal(greet('Ada'), 'Hello, Ada!');
});

test('adds two numbers', () => {
  assert.equal(sum(2, 3), 5);
});
