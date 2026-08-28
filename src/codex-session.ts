import {spawn} from 'node:child_process';
import type {Session} from './types.js';

export function resumeCodexSession(session: Session): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('codex', ['resume', '--cd', session.projectPath, session.id], {
      stdio: 'inherit',
    });

    child.once('error', error => {
      reject(new Error(`无法启动 Codex 会话：${error.message}`));
    });
    child.once('close', code => {
      resolve(code ?? 1);
    });
  });
}
