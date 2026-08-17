export type Direction = -1 | 1;

export function moveIndex(current: number, length: number, direction: Direction): number {
  if (length === 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, current + direction));
}

export function visibleRange(length: number, focusedIndex: number, capacity: number): [number, number] {
  if (length === 0 || capacity <= 0) {
    return [0, 0];
  }

  const safeFocus = Math.max(0, Math.min(length - 1, focusedIndex));
  const start = Math.max(0, Math.min(safeFocus - Math.floor(capacity / 2), length - capacity));
  return [start, Math.min(length, start + capacity)];
}

export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
