export type Session = {
  id: string;
  title: string;
  projectPath: string;
  branch: string | null;
  archived: boolean;
  updatedAt: number;
};

export interface SessionService {
  listSessions(): Promise<Session[]>;
  renameSession(id: string, name: string): Promise<void>;
  archiveSession(id: string): Promise<void>;
  unarchiveSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
}
