// Types for the synchronous SQLite API used by this application.
declare module 'better-sqlite3' {
  namespace Database {
    interface RunResult { changes: number; lastInsertRowid: number | bigint; }
    interface Statement {
      run(...params: unknown[]): RunResult;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
    }
    interface Database {
      readonly open: boolean;
      prepare(sql: string): Statement;
      exec(sql: string): this;
      pragma(sql: string): unknown[];
      transaction<T>(fn: () => T): () => T;
      backup(destination: string): Promise<{ totalPages: number; remainingPages: number }>;
      close(): this;
    }
  }
  const Database: {
    new (filename: string, options?: { readonly?: boolean; fileMustExist?: boolean }): Database.Database;
  };
  export = Database;
}
