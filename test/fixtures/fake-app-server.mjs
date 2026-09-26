import readline from 'node:readline';

const lines = readline.createInterface({input: process.stdin});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function thread(id, overrides = {}) {
  return {
    id,
    name: null,
    preview: `Preview for ${id}`,
    cwd: `/projects/${id}`,
    gitInfo: {branch: 'main'},
    updatedAt: 100,
    ...overrides,
  };
}

lines.on('line', line => {
  const message = JSON.parse(line);
  if (process.env.FAKE_MODE === 'malformed') {
    process.stdout.write('not-json\n');
    return;
  }
  if (process.env.FAKE_MODE === 'timeout') {
    return;
  }
  if (message.method === 'initialize') {
    send({id: message.id, result: {userAgent: 'fake'}});
    return;
  }
  if (message.method === 'initialized') {
    return;
  }
  if (message.method === 'thread/list') {
    const {archived, cursor, sourceKinds, modelProviders, sortKey, sortDirection} = message.params;
    if (sortKey !== 'updated_at' || sortDirection !== 'desc') {
      send({id: message.id, error: {code: -32602, message: 'unexpected filters'}});
      return;
    }
    if (process.env.FAKE_MODE === 'mixed-sources') {
      const prefix = archived ? 'archived' : 'active';
      const threads = ['cli', 'vscode', 'appServer', 'exec', 'subAgent'].map(source =>
        thread(`${prefix}-${source}`, {source, modelProvider: source === 'cli' ? 'openai' : 'custom'}),
      );
      const filtered = threads.filter(item =>
        (sourceKinds?.length ? sourceKinds : ['cli', 'vscode']).includes(item.source)
        && (modelProviders?.length === 0 || (modelProviders ?? ['openai']).includes(item.modelProvider)),
      );
      const offset = Number(cursor ?? 0);
      send({id: message.id, result: {
        data: filtered.slice(offset, offset + 1),
        nextCursor: offset + 1 < filtered.length ? String(offset + 1) : null,
      }});
      return;
    }
    if (cursor === null) {
      const prefix = archived ? 'archived' : 'active';
      send({
        id: message.id,
        result: {
          data: [thread(`${prefix}-1`, archived ? {name: 'Archived session'} : {preview: '  Active\n session  '})],
          nextCursor: 'next',
        },
      });
      return;
    }
    send({
      id: message.id,
      result: {
        data: [thread(`${archived ? 'archived' : 'active'}-2`, {preview: '', gitInfo: null})],
        nextCursor: null,
      },
    });
    return;
  }
  if (message.method === 'thread/name/set') {
    if (typeof message.params.name !== 'string') {
      send({id: message.id, error: {code: -32602, message: 'missing name'}});
    } else if (message.params.threadId.includes('fail')) {
      send({id: message.id, error: {code: -32000, message: 'fixture failure'}});
    } else {
      send({id: message.id, result: {}});
    }
    return;
  }
  if (message.method === 'thread/archive' || message.method === 'thread/unarchive' || message.method === 'thread/delete') {
    if (message.params.threadId.includes('fail')) {
      send({id: message.id, error: {code: -32000, message: 'fixture failure'}});
    } else {
      send({id: message.id, result: {}});
    }
  }
});
