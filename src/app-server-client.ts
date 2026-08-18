import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process';
import {createInterface, type Interface} from 'node:readline';
import type {Session, SessionService} from './types.js';

type ClientOptions = {
  command?: string;
  args?: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type RpcResponse = {
  id?: number;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
  };
};

type CodexThread = {
  id: string;
  name?: string | null;
  preview?: string;
  cwd: string;
  gitInfo?: {
    branch?: string | null;
  } | null;
  updatedAt: number;
};

type ThreadListResponse = {
  data: CodexThread[];
  nextCursor?: string | null;
};

const DEFAULT_TIMEOUT_MS = 30_000;
const STDERR_LIMIT = 4_000;

export class CodexAppServerClient implements SessionService {
  private readonly command: string;
  private readonly args: string[];
  private readonly env: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;
  private process: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private stderr = '';
  private fatalError: Error | null = null;
  private closing = false;

  constructor(options: ClientOptions = {}) {
    this.command = options.command ?? 'codex';
    this.args = options.args ?? ['app-server'];
    this.env = options.env ?? process.env;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }

    this.closing = false;
    this.fatalError = null;
    this.process = spawn(this.command, this.args, {
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.lines = createInterface({input: this.process.stdout});
    this.lines.on('line', line => this.handleLine(line));
    this.process.stderr.on('data', chunk => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-STDERR_LIMIT);
    });
    this.process.once('error', error => {
      this.fail(new Error(`无法启动 Codex App Server：${error.message}`));
    });
    this.process.once('exit', (code, signal) => {
      if (this.closing) {
        return;
      }
      const detail = this.stderr.trim();
      const reason = signal ? `信号 ${signal}` : `退出码 ${code ?? '未知'}`;
      this.fail(new Error(`Codex App Server 意外退出（${reason}）${detail ? `：${detail}` : ''}`));
    });

    await this.request('initialize', {
      clientInfo: {
        name: 'manage_codex_sessions',
        title: 'Manage Codex Sessions',
        version: '0.1.0',
      },
    });
    this.notify('initialized', {});
  }

  async listSessions(): Promise<Session[]> {
    const [active, archived] = await Promise.all([
      this.listThreads(false),
      this.listThreads(true),
    ]);
    return [...active, ...archived];
  }

  async archiveSession(id: string): Promise<void> {
    await this.request('thread/archive', {threadId: id});
  }

  async unarchiveSession(id: string): Promise<void> {
    await this.request('thread/unarchive', {threadId: id});
  }

  async renameSession(id: string, name: string): Promise<void> {
    await this.request('thread/name/set', {threadId: id, name});
  }

  async deleteSession(id: string): Promise<void> {
    await this.request('thread/delete', {threadId: id});
  }

  close(): void {
    this.closing = true;
    this.lines?.close();
    this.lines = null;

    if (this.process) {
      this.process.stdin.end();
      if (this.process.exitCode === null && this.process.signalCode === null) {
        this.process.kill();
      }
      this.process = null;
    }

    this.rejectPending(new Error('Codex App Server 连接已关闭'));
  }

  private async listThreads(archived: boolean): Promise<Session[]> {
    const sessions: Session[] = [];
    let cursor: string | null = null;

    do {
      const page: ThreadListResponse = await this.request<ThreadListResponse>('thread/list', {
        archived,
        cursor,
        limit: 100,
        sortKey: 'updated_at',
        sortDirection: 'desc',
        sourceKinds: ['cli'],
      });
      sessions.push(...page.data.map((thread: CodexThread) => this.toSession(thread, archived)));
      cursor = page.nextCursor ?? null;
    } while (cursor !== null);

    return sessions;
  }

  private toSession(thread: CodexThread, archived: boolean): Session {
    const name = thread.name?.trim();
    const preview = thread.preview?.replace(/\s+/g, ' ').trim();
    return {
      id: thread.id,
      title: name || preview || '未命名会话',
      projectPath: thread.cwd,
      branch: thread.gitInfo?.branch?.trim() || null,
      archived,
      updatedAt: thread.updatedAt,
    };
  }

  private request<T = unknown>(method: string, params: object): Promise<T> {
    if (this.fatalError) {
      return Promise.reject(this.fatalError);
    }
    if (!this.process?.stdin.writable) {
      return Promise.reject(new Error('Codex App Server 尚未启动'));
    }

    const id = this.nextRequestId++;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex App Server 请求超时：${method}`));
      }, this.timeoutMs);

      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
        timeout,
      });
      this.write({method, id, params});
    });
  }

  private notify(method: string, params: object): void {
    this.write({method, params});
  }

  private write(message: object): void {
    this.process?.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    let message: RpcResponse;
    try {
      message = JSON.parse(line) as RpcResponse;
    } catch {
      this.fail(new Error(`Codex App Server 返回了无效 JSON：${line.slice(0, 160)}`));
      return;
    }

    if (typeof message.id !== 'number') {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timeout);
    this.pending.delete(message.id);
    if (message.error) {
      const code = message.error.code === undefined ? '' : ` (${message.error.code})`;
      pending.reject(new Error(`Codex App Server 错误${code}：${message.error.message ?? '未知错误'}`));
      return;
    }
    pending.resolve(message.result);
  }

  private fail(error: Error): void {
    if (!this.fatalError) {
      this.fatalError = error;
    }
    this.rejectPending(this.fatalError);
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
  }
}
