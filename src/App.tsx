import {useCallback, useEffect, useMemo, useState} from 'react';
import {Box, Text, useApp, useInput, useStdout} from 'ink';
import {archiveSelected, deleteSelected, type BatchResult} from './session-actions.js';
import {moveIndex, toggleSelection, visibleRange} from './navigation.js';
import type {Session, SessionService} from './types.js';

type Column = 'active' | 'archived';
type Focus = Record<Column, number>;
type Notice = {kind: 'info' | 'success' | 'error'; text: string};

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
  const [focusedColumn, setFocusedColumn] = useState<Column>('active');
  const [focus, setFocus] = useState<Focus>({active: 0, archived: 0});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>({kind: 'info', text: '正在读取 Codex CLI 会话…'});

  const active = useMemo(() => sessions.filter(session => !session.archived), [sessions]);
  const archived = useMemo(() => sessions.filter(session => session.archived), [sessions]);
  const byColumn: Record<Column, Session[]> = {active, archived};
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

  const applyResult = useCallback(async (verb: string, result: BatchResult) => {
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
      parts.push(`跳过 ${result.skipped.length} 个已归档会话`);
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
    await applyResult('归档', result);
    setBusy(false);
  }, [active, applyResult, selected, service, sessions]);

  const runDelete = useCallback(async () => {
    setConfirmDelete(false);
    setBusy(true);
    setNotice({kind: 'info', text: `正在删除 ${selected.size} 个会话…`});
    const result = await deleteSelected(service, sessions, selected);
    await applyResult('删除', result);
    setBusy(false);
  }, [applyResult, selected, service, sessions]);

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      exit();
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

    if (key.leftArrow) {
      setFocusedColumn('active');
      return;
    }
    if (key.rightArrow) {
      setFocusedColumn('archived');
      return;
    }
    if (key.upArrow || key.downArrow) {
      const direction = key.upArrow ? -1 : 1;
      setFocus(previous => ({
        ...previous,
        [focusedColumn]: moveIndex(previous[focusedColumn], byColumn[focusedColumn].length, direction),
      }));
      return;
    }
    if (input === ' ') {
      const session = byColumn[focusedColumn][focus[focusedColumn]];
      if (session) {
        setSelected(previous => toggleSelection(previous, session.id));
      }
      return;
    }
    if (input.toLowerCase() === 'a') {
      void runArchive();
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
        <Box marginTop={1} gap={1}>
          <SessionColumn
            title="未归档"
            sessions={active}
            focused={focusedColumn === 'active'}
            focusedIndex={focus.active}
            selected={selected}
            capacity={visibleCapacity}
          />
          <SessionColumn
            title="已归档"
            sessions={archived}
            focused={focusedColumn === 'archived'}
            focusedIndex={focus.archived}
            selected={selected}
            capacity={visibleCapacity}
          />
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={noticeColor(notice.kind)}>{loading ? '加载中… ' : busy ? '处理中… ' : ''}{notice.text}</Text>
      </Box>

      {confirmDelete ? (
        <Box marginTop={1} borderStyle="round" borderColor="red" paddingX={1}>
          <Text color="red" bold>
            永久删除 {selected.size} 个会话？派生子会话也可能被删除。按 y 确认，n 取消。
          </Text>
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text dimColor>↑↓ 移动  ←→ 切列  Space 选择  a 归档  d 删除  q/Esc 退出</Text>
        </Box>
      )}
    </Box>
  );
}

type SessionColumnProps = {
  title: string;
  sessions: Session[];
  focused: boolean;
  focusedIndex: number;
  selected: ReadonlySet<string>;
  capacity: number;
};

function SessionColumn({title, sessions, focused, focusedIndex, selected, capacity}: SessionColumnProps) {
  const [start, end] = visibleRange(sessions.length, focusedIndex, capacity);
  const visible = sessions.slice(start, end);

  return (
    <Box width="50%" minHeight={5} flexDirection="column" borderStyle="round" borderColor={focused ? 'cyan' : 'gray'} paddingX={1}>
      <Text bold color={focused ? 'cyan' : 'white'}>{title} ({sessions.length})</Text>
      {sessions.length === 0 ? (
        <Text dimColor>暂无会话</Text>
      ) : (
        visible.map((session, offset) => {
          const index = start + offset;
          const isFocused = focused && index === focusedIndex;
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
