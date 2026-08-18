import {useCallback, useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {archiveSelected, deleteSelected, unarchiveSelected, type BatchResult} from './session-actions.js';
import {moveIndex, toggleSelection, toggleSessionView, visibleRange, type SessionView} from './navigation.js';
import type {Session, SessionService} from './types.js';

type Focus = Record<SessionView, number>;
type Notice = {kind: 'info' | 'success' | 'error'; text: string};
type RenameState = {session: Session; value: string};

type AppProps = {
  service: SessionService;
};

const MIN_WIDTH = 80;
const DEFAULT_ROWS = 24;

export function App({service}: AppProps) {
  const {exit} = useApp();
  const {stdout} = useStdout();
  const [terminalSize, setTerminalSize] = useState({columns: stdout.columns ?? 80, rows: stdout.rows ?? DEFAULT_ROWS});
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState<RenameState | null>(null);
  const [sessionView, setSessionView] = useState<SessionView>('active');
  const [focus, setFocus] = useState<Focus>({active: 0, archived: 0});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>({kind: 'info', text: '正在读取 Codex CLI 会话…'});

  const active = useMemo(() => sessions.filter(session => !session.archived), [sessions]);
  const archived = useMemo(() => sessions.filter(session => session.archived), [sessions]);
  const sessionsByView: Record<SessionView, Session[]> = {active, archived};
  const visibleCapacity = Math.max(1, Math.floor((terminalSize.rows - 10) / 2));

  useEffect(() => {
    const onResize = () => setTerminalSize({columns: stdout.columns ?? 80, rows: stdout.rows ?? DEFAULT_ROWS});
    stdout.on('resize', onResize);
    return () => {
      stdout.off('resize', onResize);
    };
  }, [stdout]);

  const loadSessions = useCallback(async (initial: boolean) => {
    if (initial) {
      setLoading(true);
    }
    try {
      const loaded = await service.listSessions();
      setSessions(loaded);
      setSelected(previous => {
        const existing = new Set(loaded.map(session => session.id));
        return new Set([...previous].filter(id => existing.has(id)));
      });
      setFocus(previous => ({
        active: Math.min(previous.active, Math.max(0, loaded.filter(session => !session.archived).length - 1)),
        archived: Math.min(previous.archived, Math.max(0, loaded.filter(session => session.archived).length - 1)),
      }));
      if (initial) {
        setNotice({kind: 'info', text: `已加载 ${loaded.length} 个 Codex CLI 会话`});
      }
    } catch (error) {
      setNotice({kind: 'error', text: errorMessage(error)});
    } finally {
      if (initial) {
        setLoading(false);
      }
    }
  }, [service]);

  useEffect(() => {
    void loadSessions(true);
  }, [loadSessions]);

  const applyResult = useCallback(async (verb: string, result: BatchResult, skippedDescription: string) => {
    setSelected(previous => {
      const next = new Set(previous);
      for (const id of result.succeeded) {
        next.delete(id);
      }
      return next;
    });
    await loadSessions(false);

    const parts = [`${verb}成功 ${result.succeeded.length} 个`];
    if (result.skipped.length > 0) {
      parts.push(`跳过 ${result.skipped.length} 个${skippedDescription}`);
    }
    if (result.failed.size > 0) {
      const firstError = result.failed.values().next().value as string | undefined;
      parts.push(`失败 ${result.failed.size} 个${firstError ? `：${firstError}` : ''}`);
    }
    setNotice({kind: result.failed.size > 0 ? 'error' : 'success', text: parts.join('；')});
  }, [loadSessions]);

  const runArchive = useCallback(async () => {
    const archiveCount = active.filter(session => selected.has(session.id)).length;
    if (archiveCount === 0) {
      setNotice({kind: 'info', text: '没有选中的未归档会话'});
      return;
    }

    setBusy(true);
    setNotice({kind: 'info', text: `正在归档 ${archiveCount} 个会话…`});
    const result = await archiveSelected(service, sessions, selected);
    await applyResult('归档', result, '已归档会话');
    setBusy(false);
  }, [active, applyResult, selected, service, sessions]);

  const runUnarchive = useCallback(async () => {
    const unarchiveCount = archived.filter(session => selected.has(session.id)).length;
    if (unarchiveCount === 0) {
      setNotice({kind: 'info', text: '没有选中的已归档会话'});
      return;
    }

    setBusy(true);
    setNotice({kind: 'info', text: `正在取消归档 ${unarchiveCount} 个会话…`});
    const result = await unarchiveSelected(service, sessions, selected);
    await applyResult('取消归档', result, '未归档会话');
    setBusy(false);
  }, [applyResult, archived, selected, service, sessions]);

  const runDelete = useCallback(async () => {
    setConfirmDelete(false);
    setBusy(true);
    setNotice({kind: 'info', text: `正在删除 ${selected.size} 个会话…`});
    const result = await deleteSelected(service, sessions, selected);
    await applyResult('删除', result, '会话');
    setBusy(false);
  }, [applyResult, selected, service, sessions]);

  const runRename = useCallback(async (session: Session, value: string) => {
    const name = value.trim();
    if (!name) {
      setNotice({kind: 'error', text: '会话名称不能为空'});
      return;
    }

    setRenaming(null);
    setBusy(true);
    setNotice({kind: 'info', text: `正在重命名“${session.title}”…`});
    try {
      await service.renameSession(session.id, name);
      await loadSessions(false);
      setNotice({kind: 'success', text: '会话已重命名'});
    } catch (error) {
      setNotice({kind: 'error', text: errorMessage(error)});
    } finally {
      setBusy(false);
    }
  }, [loadSessions, service]);

  useInput((input, key) => {
    if (!renaming && input === 'q') {
      exit();
      return;
    }

    if (renaming) {
      if (key.escape) {
        setRenaming(null);
        setNotice({kind: 'info', text: '已取消重命名'});
      } else if (key.return) {
        void runRename(renaming.session, renaming.value);
      } else if (key.backspace || key.delete) {
        setRenaming(previous => previous ? {...previous, value: previous.value.slice(0, -1)} : null);
      } else if (input) {
        setRenaming(previous => previous ? {...previous, value: `${previous.value}${input}`} : null);
      }
      return;
    }

    if (confirmDelete) {
      if (input.toLowerCase() === 'y') {
        void runDelete();
      } else if (input.toLowerCase() === 'n') {
        setConfirmDelete(false);
        setNotice({kind: 'info', text: '已取消删除'});
      }
      return;
    }

    if (loading || busy) {
      return;
    }

    if (key.tab) {
      setSessionView(toggleSessionView);
      return;
    }
    if (key.upArrow || key.downArrow) {
      const direction = key.upArrow ? -1 : 1;
      setFocus(previous => ({
        ...previous,
        [sessionView]: moveIndex(previous[sessionView], sessionsByView[sessionView].length, direction),
      }));
      return;
    }
    if (input === ' ') {
      const session = sessionsByView[sessionView][focus[sessionView]];
      if (session) {
        setSelected(previous => toggleSelection(previous, session.id));
      }
      return;
    }
    if (input.toLowerCase() === 'r' && sessionView === 'active') {
      const session = sessionsByView[sessionView][focus[sessionView]];
      if (session) {
        setRenaming({session, value: ''});
        setNotice({kind: 'info', text: `输入“${session.title}”的新名称`});
      }
      return;
    }
    if (input.toLowerCase() === 'a' && sessionView === 'active') {
      void runArchive();
      return;
    }
    if (input.toLowerCase() === 'u' && sessionView === 'archived') {
      void runUnarchive();
      return;
    }
    if (input.toLowerCase() === 'd') {
      if (selected.size === 0) {
        setNotice({kind: 'info', text: '请先选择要删除的会话'});
      } else {
        setConfirmDelete(true);
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="cyan">Manage Codex Sessions</Text>
        <Text dimColor>已选择 {selected.size}</Text>
      </Box>

      {terminalSize.columns < MIN_WIDTH ? (
        <Box marginTop={1} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">终端宽度至少需要 {MIN_WIDTH} 列，当前为 {terminalSize.columns} 列。请扩大终端窗口。</Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <SessionList
            title={sessionView === 'active' ? '未归档' : '已归档'}
            sessions={sessionsByView[sessionView]}
            focusedIndex={focus[sessionView]}
            selected={selected}
            capacity={visibleCapacity}
          />
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={noticeColor(notice.kind)}>{loading ? '加载中… ' : busy ? '处理中… ' : ''}{notice.text}</Text>
      </Box>

      {renaming ? (
        <Box marginTop={1} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text color="cyan">重命名会话：{renaming.value || ' '}</Text>
          <Text dimColor>  Enter 确认  Esc 取消</Text>
        </Box>
      ) : confirmDelete ? (
        <Box marginTop={1} borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red" bold>
            永久删除 {selected.size} 个会话？派生子会话也可能被删除。按 y 确认，n 取消。
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>
            ↑↓ 移动  Tab 切换未归档/已归档  Space 选择  {sessionView === 'active' ? 'r 重命名  a 归档' : 'u 取消归档'}  d 删除  q 退出
          </Text>
        </Box>
      )}
    </Box>
  );
}

type SessionListProps = {
  title: string;
  sessions: Session[];
  focusedIndex: number;
  selected: ReadonlySet<string>;
  capacity: number;
};

function SessionList({title, sessions, focusedIndex, selected, capacity}: SessionListProps) {
  const [start, end] = visibleRange(sessions.length, focusedIndex, capacity);
  const visible = sessions.slice(start, end);

  return (
    <Box width="100%" minHeight={5} flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text bold color="cyan">{title} ({sessions.length})</Text>
      {sessions.length === 0 ? (
        <Text dimColor>暂无会话</Text>
      ) : (
        visible.map((session, offset) => {
          const index = start + offset;
          const isFocused = index === focusedIndex;
          const isSelected = selected.has(session.id);
          return (
            <Box key={session.id} flexDirection="column" marginTop={offset === 0 ? 0 : 1}>
              <Text color={isFocused ? 'cyan' : isSelected ? 'green' : 'white'} bold={isFocused} wrap="truncate-end">
                {isFocused ? '▶' : ' '} [{isSelected ? 'x' : ' '}] {session.title}
              </Text>
              <Text dimColor wrap="truncate-middle">
                {displayPath(session.projectPath)}  <Text color="yellow"> {session.branch ?? '—'}</Text>
              </Text>
            </Box>
          );
        })
      )}
      {sessions.length > visible.length ? (
        <Text dimColor>{start + 1}–{end} / {sessions.length}</Text>
      ) : null}
    </Box>
  );
}

function displayPath(path: string): string {
  const home = process.env.HOME;
  if (home && (path === home || path.startsWith(`${home}/`))) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function noticeColor(kind: Notice['kind']): 'red' | 'green' | 'white' {
  if (kind === 'error') {
    return 'red';
  }
  if (kind === 'success') {
    return 'green';
  }
  return 'white';
}
