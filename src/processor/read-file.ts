"use client";

import { gzip } from "pako";

export type ReadRequest = { file: File; key: string };

export type ReadReply =
  | {
      ok: true;
      /** The SQLite file. */
      database: Uint8Array;
      packageID: string;
      /** The processor's version, which wrote it. */
      version: string;
      /** Per table, the rows the schema refused. */
      dropped: Record<string, number>;
    }
  | { ok: false; code: string; message: string };

/** How much of what the package needs is read, as it goes. */
export type ReadProgress = { progress: number };

export type ReadPackage = {
  /** The database, gzipped as the API serves one. */
  gzipped: Uint8Array<ArrayBuffer>;
  packageID: string;
  version: string;
  /** What encrypts the database for the server, and asks the API for it. */
  key: string;
};

/** A package the processor couldn't read; `code` is the API's for a package. */
export class PackageReadError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    // What an error report names it by.
    this.name = code;
  }
}

/** A zip starts with a local file header, "PK\3\4". */
export async function isZip(file: File) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return (
    head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
  );
}

/** 32 random bytes, in base64url: a key needs no escaping in a header. */
function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/**
 * Reads a package file on the device, in a worker, into the database the app
 * opens. The file never leaves the device. onProgress hears how much of it is
 * read, in percent.
 */
export async function readPackageFile(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<ReadPackage> {
  const key = newKey();
  // Built by `pnpm script:build-processor` from `./worker.ts`.
  const worker = new Worker("/wasm/processor/worker.js");
  try {
    const reply = await new Promise<ReadReply>((resolve, reject) => {
      worker.onmessage = ({ data }: MessageEvent<ReadReply | ReadProgress>) => {
        if ("progress" in data) onProgress?.(data.progress);
        else resolve(data);
      };
      worker.onerror = (event) =>
        reject(new PackageReadError("UNKNOWN_ERROR", event.message));
      worker.postMessage({ file, key } satisfies ReadRequest);
    });
    if (!reply.ok) throw new PackageReadError(reply.code, reply.message);
    return {
      // A new array of its own length, which `ArrayBuffer` types.
      gzipped: gzip(reply.database) as Uint8Array<ArrayBuffer>,
      packageID: reply.packageID,
      version: reply.version,
      key,
    };
  } finally {
    worker.terminate();
  }
}
