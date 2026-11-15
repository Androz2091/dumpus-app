// Reads a package file with the processor built for the browser
// (`processor/cmd/dumpus-wasm`) and writes the database it describes with
// sql.js, off the page's thread: a large package takes seconds.
//
// A classic worker, written as a script: `pnpm script:build-processor`
// transpiles it into `public/wasm/processor/worker.js` next to the files it
// loads (Turbopack copies a `new Worker(new URL(...))` file as is, unbundled).

type ReadRequest = import("./read-file").ReadRequest;
type ReadReply = import("./read-file").ReadReply;

type Processor = {
  version: string;
  schema(): string;
  process(
    size: number,
    readAt: (offset: number, length: number) => Uint8Array,
    key: string,
    onRows: (table: string, query: string, rows: string) => void,
  ): string;
};

// A worker's globals, which the app's TypeScript, made for pages, lacks.
// `initSqlJs`, which `sql-wasm.js` sets, is declared by sql.js's types.
declare function importScripts(...urls: string[]): void;
declare const FileReaderSync: {
  new (): { readAsArrayBuffer(blob: Blob): ArrayBuffer };
};
declare const Go: new () => {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
};

(() => {
  const BASE = "/wasm/processor/";
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent<ReadRequest>) => void) | null;
    postMessage(message: ReadReply, transfer?: Transferable[]): void;
  };

  let processor: Promise<Processor> | undefined;

  function loadProcessor() {
    processor ??= (async () => {
      importScripts(`${BASE}wasm_exec.js`, `${BASE}sql-wasm.js`);
      const go = new Go();
      let instance: WebAssembly.Instance;
      try {
        ({ instance } = await WebAssembly.instantiateStreaming(
          fetch(`${BASE}processor.wasm`),
          go.importObject,
        ));
      } catch {
        // Served as another type than `application/wasm`, by some WebViews.
        const response = await fetch(`${BASE}processor.wasm`);
        ({ instance } = await WebAssembly.instantiate(
          await response.arrayBuffer(),
          go.importObject,
        ));
      }
      // Never settles: the module answers until the worker ends.
      void go.run(instance);
      return (globalThis as unknown as { dumpusProcessor: Processor })
        .dumpusProcessor;
    })();
    return processor;
  }

  scope.onmessage = async ({ data: { file, key } }) => {
    try {
      const dumpus = await loadProcessor();
      const SQL = await initSqlJs({ locateFile: (name) => `/wasm/${name}` });
      const schema: { tables: string[]; indexes: string[] } = JSON.parse(
        dumpus.schema(),
      );
      const db = new SQL.Database();
      for (const ddl of schema.tables) db.run(ddl);
      db.run("BEGIN");
      const statements = new Map<string, import("sql.js").Statement>();
      const dropped: Record<string, number> = {};
      const reader = new FileReaderSync();
      const result: { packageId?: string; error?: string; message?: string } =
        JSON.parse(
          dumpus.process(
            file.size,
            (offset, length) =>
              new Uint8Array(
                reader.readAsArrayBuffer(file.slice(offset, offset + length)),
              ),
            key,
            (table, query, rows) => {
              let statement = statements.get(table);
              if (!statement) {
                statement = db.prepare(query);
                statements.set(table, statement);
              }
              for (const row of JSON.parse(rows)) {
                try {
                  statement.run(row);
                } catch (err) {
                  statement.reset();
                  // As on the server, a row the schema refuses is left out.
                  if (!/constraint failed/i.test(String(err))) throw err;
                  dropped[table] = (dropped[table] ?? 0) + 1;
                }
              }
            },
          ),
        );
      for (const statement of statements.values()) statement.free();
      if (result.error || !result.packageId) {
        db.close();
        scope.postMessage({
          ok: false,
          code: result.error ?? "UNKNOWN_ERROR",
          message: result.message ?? "",
        });
        return;
      }
      db.run("COMMIT");
      for (const ddl of schema.indexes) db.run(ddl);
      db.run("VACUUM");
      const database = db.export();
      db.close();
      scope.postMessage(
        {
          ok: true,
          database,
          packageID: result.packageId,
          version: dumpus.version,
          dropped,
        },
        [database.buffer],
      );
    } catch (err) {
      scope.postMessage({
        ok: false,
        code: "UNKNOWN_ERROR",
        message: String(err),
      });
    }
  };
})();
