#!/usr/bin/env node
import process from 'node:process';
import React from 'react';
import {render} from 'ink';
import {App} from './App.js';
import {CodexAppServerClient} from './app-server-client.js';

const VERSION = '0.1.0';

const HELP = `Manage Codex Sessions

Usage:
  mcs
  mcs --help
  mcs --version

Keys:
  ↑/↓       Move within the focused column
  ←/→       Switch between active and archived sessions
  Space     Select or unselect a session
  a         Archive selected active sessions
  d         Delete selected sessions
  q, Esc    Quit

Requirements:
  Node.js 20+
  Codex CLI with App Server support available as "codex"
`;

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (argument === '--help' || argument === '-h') {
    process.stdout.write(HELP);
    return;
  }
  if (argument === '--version' || argument === '-v') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (process.argv.length > 2) {
    process.stderr.write(`未知参数：${process.argv.slice(2).join(' ')}\n运行 mcs --help 查看用法。\n`);
    process.exitCode = 1;
    return;
  }
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('mcs 需要在交互式终端中运行。\n');
    process.exitCode = 1;
    return;
  }

  const client = new CodexAppServerClient();
  try {
    await client.start();
    const instance = render(<App service={client} />);
    await instance.waitUntilExit();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n请确认已安装较新的 Codex CLI，并可运行 codex app-server。\n`);
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

void main();
