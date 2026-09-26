import {PassThrough, Writable} from 'node:stream';
import {stripVTControlCharacters} from 'node:util';
import {fileURLToPath} from 'node:url';
import {createElement} from 'react';
import {render} from 'ink';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {App} from '../src/App.js';
import {CodexAppServerClient} from '../src/app-server-client.js';
import type {Session, SessionService} from '../src/types.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});

function session(index: number): Session {
  return {
    id: String(index), title: `会话 ${index}`, projectPath: `/projects/project-${index}`,
    branch: `feature/branch-${index}`, archived: false, updatedAt: index,
  };
}

function readOnlyService(sessions = Array.from({length: 30}, (_, index) => session(index))): SessionService {
  const unexpectedMutation = async () => { throw new Error('Unexpected mutation in layout test'); };
  return {
    listSessions: async () => sessions,
    archiveSession: unexpectedMutation, unarchiveSession: unexpectedMutation,
    deleteSession: unexpectedMutation, renameSession: unexpectedMutation,
  };
}

async function mount(columns: number, service = readOnlyService(), rows = 24) {
  let frame = '';
  const stdout = Object.assign(new Writable({
    write(chunk, _encoding, callback) {
      const text = stripVTControlCharacters(String(chunk));
      if (text.trim()) frame = text;
      callback();
    },
  }), {columns, rows, isTTY: true});
  const stdin = Object.assign(new PassThrough(), {
    isTTY: true, setRawMode() {}, ref() {}, unref() {},
  });
  const instance = render(createElement(App, {service}), {
    stdout: stdout as NodeJS.WriteStream,
    stdin: stdin as unknown as NodeJS.ReadStream,
    debug: true, patchConsole: false, exitOnCtrlC: false,
  });
  cleanup.push(() => { instance.unmount(); instance.cleanup(); stdin.destroy(); stdout.destroy(); });
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  await vi.waitFor(() => {
    expect(frame).not.toBe('');
    expect(frame).not.toContain('正在读取');
  });
  await settle();
  return {
    frame: () => frame,
    async input(value: string) { stdin.write(value); await settle(); },
    async resize(width: number, height = rows) {
      stdout.columns = width;
      stdout.rows = height;
      stdout.emit('resize');
      await settle();
    },
  };
}

function expectFits(frame: string, columns: number, rows = 24) {
  const lines = frame.trimEnd().split('\n');
  expect(lines.length).toBeLessThanOrEqual(rows);
  // These fixtures use CJK and ASCII; CJK characters occupy two terminal cells.
  for (const line of lines) {
    const width = [...line].reduce((sum, character) => sum + (/[\u2e80-\u9fff\uff01-\uff60]/u.test(character) ? 2 : 1), 0);
    expect(width, line).toBeLessThanOrEqual(columns);
  }
}

describe('responsive terminal UI', () => {
  it.each([30, 40, 60, 79, 80, 120])('shows an operable list at %i columns', async columns => {
    const app = await mount(columns);
    expect(app.frame()).toContain('▶ [ ] 会话 0');
    expect(app.frame()).toContain('q 退出');
    expect(app.frame()).not.toContain('请扩大');
    expectFits(app.frame(), columns);
    if (columns < 80) {
      expect(app.frame()).toContain('MCS');
      expect(app.frame()).toContain('目录：/projects/project-0');
      expect(app.frame()).not.toContain('/projects/project-1');
    } else {
      expect(app.frame()).toContain('Manage Codex Sessions');
      expect(app.frame()).toContain('/projects/project-1');
    }
    await app.input(' ');
    expect(app.frame()).toContain('[x] 会话 0');
    expect(app.frame()).toContain('▶ [ ] 会话 1');
    if (columns < 80) expect(app.frame()).toContain('目录：/projects/project-1');
    for (let index = 0; index < 29; index++) await app.input('\x1b[B');
    expect(app.frame()).toContain('▶ [ ] 会话 29');
    expectFits(app.frame(), columns);
  });

  it.each([40, 80])('keeps empty and short lists compact in a tall %i-column terminal', async columns => {
    for (const count of [0, 1, 3]) {
      const app = await mount(columns, readOnlyService(Array.from({length: count}, (_, index) => session(index))));
      const shortWindow = app.frame();
      await app.resize(columns, 60);
      expect(app.frame()).toBe(shortWindow);
      expect(app.frame()).not.toMatch(/\n(?:│ +│\n){2}/u);
      expect(app.frame()).toContain(count === 0 ? '暂无会话' : '▶ [ ] 会话 0');
      expect(app.frame()).toContain('q 退出');
      expectFits(app.frame(), columns, 18);
    }
  });

  it('preserves view, selections, focus and rename input across resizing', async () => {
    const archived = {...session(99), archived: true};
    const app = await mount(79, readOnlyService([session(0), session(1), archived]));
    await app.input(' ');
    await app.input('\t');
    await app.input(' ');
    await app.resize(80);
    expect(app.frame()).toContain('已归档 (1)');
    expect(app.frame()).toContain('▶ [x] 会话 99');
    expect(app.frame()).toContain('已选择 2');
    await app.input('\t');
    expect(app.frame()).toContain('▶ [ ] 会话 1');
    await app.input('r');
    await app.input('a-very-long-name-'.repeat(6) + '末尾');
    await app.resize(40);
    expect(app.frame()).toContain('末尾');
    expect(app.frame()).toContain('Enter 确认');
    expectFits(app.frame(), 40);
    await app.input('\x1b');
    expect(app.frame()).toContain('已取消重命名');
    expect(app.frame()).toContain('已选择 2');
    await app.resize(60, 18);
    expectFits(app.frame(), 60, 18);
  });

  it('truncates long details and clears them when switching to an empty view', async () => {
    const app = await mount(40, readOnlyService([{
      ...session(0), title: '中文会话标题'.repeat(20),
      projectPath: '/very-long-directory/'.repeat(8) + 'project-end',
      branch: 'feature/'.repeat(20),
    }]));
    expect(app.frame()).toContain('project-end');
    expect(app.frame()).toContain('分支：feature/');
    expectFits(app.frame(), 40);
    await app.input('\t');
    expect(app.frame()).toContain('暂无会话');
    expect(app.frame()).toContain('目录：—');
    expect(app.frame()).toContain('分支：—');
    expect(app.frame()).not.toContain('project-end');
  });

  it('keeps full errors visible even when a short terminal must scroll', async () => {
    const message = '读取失败：' + '服务器暂时无法连接，请稍后重试。'.repeat(8) + '错误结束';
    const service = readOnlyService();
    service.listSessions = async () => { throw new Error(message); };
    const app = await mount(40, service, 12);
    expect(app.frame().replace(/\s/g, '')).toContain(message);
    expect(app.frame()).toContain('q 退出');
  });

  it('performs narrow-screen actions through the fake App Server and requires delete confirmation', async () => {
    const client = new CodexAppServerClient({
      command: process.execPath,
      args: [fileURLToPath(new URL('./fixtures/fake-app-server.mjs', import.meta.url))],
    });
    cleanup.push(() => client.close());
    await client.start();
    const rename = vi.spyOn(client, 'renameSession');
    const archive = vi.spyOn(client, 'archiveSession');
    const unarchive = vi.spyOn(client, 'unarchiveSession');
    const remove = vi.spyOn(client, 'deleteSession');
    const app = await mount(40, client);
    await app.input('r');
    const name = 'new-name-'.repeat(10) + '结束';
    await app.input(name);
    await app.input('\r');
    await vi.waitFor(() => expect(rename).toHaveBeenCalledWith('active-1', name));
    await vi.waitFor(() => expect(app.frame()).toContain('会话已重命名'));
    await app.input(' ');
    await app.input('a');
    await vi.waitFor(() => expect(archive).toHaveBeenCalledWith('active-1'));
    await vi.waitFor(() => expect(app.frame()).toContain('归档成功 1 个'));
    await app.input('\t');
    await app.input(' ');
    await app.input('u');
    await vi.waitFor(() => expect(unarchive).toHaveBeenCalledWith('archived-1'));
    await vi.waitFor(() => expect(app.frame()).toContain('取消归档成功 1 个'));
    await app.input(' ');
    await app.input('d');
    expect(remove).not.toHaveBeenCalled();
    expect(app.frame().replace(/[\s│]/g, '')).toContain('永久删除1个会话？派生子会话也可能被删除。按y确认，n取消。');
    expectFits(app.frame(), 40);
    await app.resize(80);
    expect(app.frame()).toContain('永久删除');
    await app.input('n');
    expect(remove).not.toHaveBeenCalled();
    await app.resize(40);
    await app.input('d');
    await app.input('y');
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('archived-2'));
    await vi.waitFor(() => expect(app.frame()).toContain('删除成功 1 个'));
  });
});
