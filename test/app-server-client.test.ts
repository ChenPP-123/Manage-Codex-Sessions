import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {CodexAppServerClient} from '../src/app-server-client.js';

const fixture = fileURLToPath(new URL('./fixtures/fake-app-server.mjs', import.meta.url));

function createClient(mode?: string, timeoutMs = 1_000) {
  return new CodexAppServerClient({
    command: process.execPath,
    args: [fixture],
    env: {...process.env, ...(mode ? {FAKE_MODE: mode} : {})},
    timeoutMs,
  });
}

describe('CodexAppServerClient', () => {
  it('loads every active and archived CLI page and maps display fields', async () => {
    const client = createClient();
    try {
      await client.start();
      const sessions = await client.listSessions();
      expect(sessions).toHaveLength(4);
      expect(sessions[0]).toMatchObject({
        id: 'active-1',
        title: 'Active session',
        branch: 'main',
        archived: false,
      });
      expect(sessions[1]).toMatchObject({title: '未命名会话', branch: null});
      expect(sessions[2]).toMatchObject({id: 'archived-1', title: 'Archived session', archived: true});
    } finally {
      client.close();
    }
  });

  it('surfaces App Server request errors', async () => {
    const client = createClient();
    try {
      await client.start();
      await expect(client.deleteSession('fail-session')).rejects.toThrow('fixture failure');
    } finally {
      client.close();
    }
  });

  it('renames a session through the App Server', async () => {
    const client = createClient();
    try {
      await client.start();
      await expect(client.renameSession('active-1', 'Renamed session')).resolves.toBeUndefined();
      await expect(client.renameSession('fail-session', 'Renamed session')).rejects.toThrow('fixture failure');
    } finally {
      client.close();
    }
  });

  it('unarchives a session through the App Server', async () => {
    const client = createClient();
    try {
      await client.start();
      await expect(client.unarchiveSession('archived-1')).resolves.toBeUndefined();
    } finally {
      client.close();
    }
  });

  it('fails clearly when the server returns malformed JSON', async () => {
    const client = createClient('malformed');
    try {
      await expect(client.start()).rejects.toThrow('无效 JSON');
    } finally {
      client.close();
    }
  });

  it('times out unanswered requests', async () => {
    const client = createClient('timeout', 30);
    try {
      await expect(client.start()).rejects.toThrow('请求超时：initialize');
    } finally {
      client.close();
    }
  });
});
