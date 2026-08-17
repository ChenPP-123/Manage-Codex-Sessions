import {describe, expect, it} from 'vitest';
import {moveIndex, toggleSelection, visibleRange} from '../src/navigation.js';

describe('navigation', () => {
  it('keeps focus within a column', () => {
    expect(moveIndex(0, 3, -1)).toBe(0);
    expect(moveIndex(0, 3, 1)).toBe(1);
    expect(moveIndex(2, 3, 1)).toBe(2);
    expect(moveIndex(3, 0, -1)).toBe(0);
  });

  it('keeps the focused row inside the visible window', () => {
    expect(visibleRange(10, 0, 4)).toEqual([0, 4]);
    expect(visibleRange(10, 5, 4)).toEqual([3, 7]);
    expect(visibleRange(10, 9, 4)).toEqual([6, 10]);
  });

  it('toggles selections without mutating the original set', () => {
    const original = new Set(['a']);
    expect([...toggleSelection(original, 'b')]).toEqual(['a', 'b']);
    expect([...toggleSelection(original, 'a')]).toEqual([]);
    expect([...original]).toEqual(['a']);
  });
});
