// Thin wrapper around the Pyodide Web Worker
// Lazy-loads the worker on first use — zero cost if Python is never needed

export interface PythonResult {
  stdout: string;
  stderr: string;
  error?: string;
}

let worker: Worker | null = null;
let pyodideReady = false;
let pyodideLoading = false;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./pyodide-worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

export function isPyodideReady(): boolean {
  return pyodideReady;
}

export function isPyodideLoading(): boolean {
  return pyodideLoading;
}

export function runPython(code: string, setupCode?: string): Promise<PythonResult> {
  return new Promise((resolve) => {
    const w = getWorker();

    const handler = (e: MessageEvent) => {
      if (e.data.type === "loading") {
        pyodideLoading = true;
      } else if (e.data.type === "ready") {
        pyodideLoading = false;
        pyodideReady = true;
      } else if (e.data.type === "result") {
        w.removeEventListener("message", handler);
        pyodideLoading = false;
        resolve({
          stdout: e.data.stdout || "",
          stderr: e.data.stderr || "",
          error: e.data.error,
        });
      }
    };

    w.addEventListener("message", handler);
    w.postMessage({ type: "run", code, setupCode });
  });
}
