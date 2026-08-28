import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {describe, expect, it, vi} from 'vitest';
import {resumeCodexSession} from '../src/codex-session.js';
import type {Session} from '../src/types.js';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

const session: Session = {
  id: 'session-123',
  title: 'Focused session',
  projectPath: '/projects/focused',
  branch: 'main',
  archived: false,
  updatedAt: 1,
};

describe('resumeCodexSession', () => {
  it('runs Codex for the selected session in its project directory', async () => {
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);

    const result = resumeCodexSession(session);

    expect(spawn).toHaveBeenCalledWith(
      'codex',
      ['resume', '--cd', '/projects/focused', 'session-123'],
      {stdio: 'inherit'},
    );
    child.emit('close', 0);
    await expect(result).resolves.toBe(0);
  });

  it('returns a failure code when Codex exits because of a signal', async () => {
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);

    const result = resumeCodexSession(session);
    child.emit('close', null);

    await expect(result).resolves.toBe(1);
  });

  it('reports a clear error when Codex cannot start', async () => {
    const child = new EventEmitter();
    vi.mocked(spawn).mockReturnValue(child as ReturnType<typeof spawn>);

    const result = resumeCodexSession(session);
    child.emit('error', new Error('command not found'));

    await expect(result).rejects.toThrow('无法启动 Codex 会话：command not found');
  });
});
