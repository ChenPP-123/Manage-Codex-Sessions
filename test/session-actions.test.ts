import {describe, expect, it, vi} from 'vitest';
import {archiveSelected, deleteSelected} from '../src/session-actions.js';
import type {Session, SessionService} from '../src/types.js';

const sessions: Session[] = [
  {id: 'active', title: 'Active', projectPath: '/a', branch: 'main', archived: false, updatedAt: 2},
  {id: 'fail', title: 'Fail', projectPath: '/b', branch: null, archived: false, updatedAt: 1},
  {id: 'archived', title: 'Archived', projectPath: '/c', branch: 'dev', archived: true, updatedAt: 0},
];

function service(): SessionService {
  return {
    listSessions: vi.fn(async () => sessions),
    archiveSession: vi.fn(async id => {
      if (id === 'fail') throw new Error('archive failed');
    }),
    deleteSession: vi.fn(async id => {
      if (id === 'fail') throw new Error('delete failed');
    }),
  };
}

describe('session actions', () => {
  it('archives active selections and skips archived selections', async () => {
    const target = service();
    const result = await archiveSelected(target, sessions, new Set(['active', 'archived']));
    expect(target.archiveSession).toHaveBeenCalledTimes(1);
    expect(result.succeeded).toEqual(['active']);
    expect(result.skipped).toEqual(['archived']);
  });

  it('continues after a failure and reports it by session', async () => {
    const target = service();
    const result = await deleteSelected(target, sessions, new Set(['active', 'fail', 'archived']));
    expect(target.deleteSession).toHaveBeenCalledTimes(3);
    expect(result.succeeded).toEqual(['active', 'archived']);
    expect(result.failed.get('fail')).toBe('delete failed');
  });
});
