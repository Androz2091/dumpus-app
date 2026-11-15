const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Builds what reads a package file on the device into `public/wasm/processor/`:
// the processor's WebAssembly module, Go's glue for it, which must come from
// the Go that built it, the worker running them (`src/processor/worker.ts`,
// transpiled to a plain script) and sql.js's loader, for the worker.
//
// Without Go, a build in CI fails; elsewhere the build goes on without the
// module, with a warning, and reading a file fails until Go is installed.

const root = path.join(__dirname, "..");
const out = path.join(root, "public", "wasm", "processor");

let goroot;
try {
  goroot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
} catch {
  if (process.env.CI) {
    throw new Error("Go is needed to build the processor for the browser.");
  }
  const kept = fs.existsSync(path.join(out, "processor.wasm"));
  console.warn(
    kept
      ? "Go isn't installed: the processor's last WebAssembly build is kept."
      : "Go isn't installed: the app can't read a package file until the processor is built.",
  );
  process.exit(0);
}

fs.mkdirSync(out, { recursive: true });
execFileSync(
  "go",
  [
    "build",
    "-trimpath",
    // As `api/Makefile` builds the worker's: no VCS state, which a container
    // can't always read.
    "-buildvcs=false",
    "-ldflags=-s -w",
    "-o",
    path.join(out, "processor.wasm"),
    "./cmd/dumpus-wasm",
  ],
  {
    cwd: path.join(root, "processor"),
    env: { ...process.env, GOOS: "js", GOARCH: "wasm" },
    stdio: "inherit",
  },
);
fs.copyFileSync(
  path.join(goroot, "lib", "wasm", "wasm_exec.js"),
  path.join(out, "wasm_exec.js"),
);
// The worker's types are checked with the app's; this only strips them.
const ts = require("typescript");
const worker = ts.transpileModule(
  fs.readFileSync(path.join(root, "src", "processor", "worker.ts"), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2020 } },
);
fs.writeFileSync(path.join(out, "worker.js"), worker.outputText);
fs.copyFileSync(
  require.resolve("sql.js/dist/sql-wasm.js"),
  path.join(out, "sql-wasm.js"),
);
console.log("Built the processor for the browser.");
