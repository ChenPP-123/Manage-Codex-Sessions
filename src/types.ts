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
  archiveSession(id: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
}
