import type {Session, SessionService} from './types.js';

export type BatchResult = {
  succeeded: string[];
  failed: Map<string, string>;
  skipped: string[];
};

export async function archiveSelected(
  service: SessionService,
  sessions: readonly Session[],
  selected: ReadonlySet<string>,
): Promise<BatchResult> {
  const targets = sessions.filter(session => selected.has(session.id) && !session.archived);
  const skipped = sessions.filter(session => selected.has(session.id) && session.archived).map(session => session.id);
  return runSequentially(targets, skipped, session => service.archiveSession(session.id));
}

export async function deleteSelected(
  service: SessionService,
  sessions: readonly Session[],
  selected: ReadonlySet<string>,
): Promise<BatchResult> {
  const targets = sessions.filter(session => selected.has(session.id));
  return runSequentially(targets, [], session => service.deleteSession(session.id));
}

async function runSequentially(
  targets: readonly Session[],
  skipped: string[],
  action: (session: Session) => Promise<void>,
): Promise<BatchResult> {
  const succeeded: string[] = [];
  const failed = new Map<string, string>();

  for (const session of targets) {
    try {
      await action(session);
      succeeded.push(session.id);
    } catch (error) {
      failed.set(session.id, error instanceof Error ? error.message : String(error));
    }
  }

  return {succeeded, failed, skipped};
}
