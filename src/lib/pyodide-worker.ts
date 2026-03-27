// Web Worker for running Python code via Pyodide (WebAssembly)
// This runs in a separate thread to avoid blocking the UI

/* eslint-disable no-restricted-globals */
const ctx = self as unknown as Worker & { importScripts: (...urls: string[]) => void };

declare function loadPyodide(config?: Record<string, unknown>): Promise<PyodideInterface>;

interface PyodideInterface {
  runPython(code: string): unknown;
  runPythonAsync(code: string): Promise<unknown>;
}

let pyodide: PyodideInterface | null = null;
let loading = false;

async function ensurePyodide(): Promise<PyodideInterface> {
  if (pyodide) return pyodide;
  if (loading) {
    // Wait for in-progress load
    while (!pyodide) await new Promise((r) => setTimeout(r, 100));
    return pyodide;
  }
  loading = true;
  ctx.importScripts("https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.js");
  pyodide = await loadPyodide();
  loading = false;
  return pyodide;
}

ctx.onmessage = async (e: MessageEvent<{ type: string; code: string; setupCode?: string }>) => {
  if (e.data.type !== "run") return;

  try {
    ctx.postMessage({ type: "loading" });
    const py = await ensurePyodide();
    ctx.postMessage({ type: "ready" });

    // Reset stdout/stderr capture
    py.runPython(`
import sys, io
_stdout_capture = io.StringIO()
_stderr_capture = io.StringIO()
sys.stdout = _stdout_capture
sys.stderr = _stderr_capture
`);

    // Run setup code if provided (test data, imports)
    if (e.data.setupCode) {
      py.runPython(e.data.setupCode);
    }

    // Run user code with timeout
    const timeoutMs = 10000;
    const result = await Promise.race([
      (async () => {
        py.runPython(e.data.code);
        const stdout = py.runPython("_stdout_capture.getvalue()") as string;
        const stderr = py.runPython("_stderr_capture.getvalue()") as string;
        return { stdout: stdout || "", stderr: stderr || "" };
      })(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Execution timed out after 10 seconds")), timeoutMs)
      ),
    ]);

    ctx.postMessage({ type: "result", stdout: result.stdout, stderr: result.stderr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Try to capture any partial stdout
    let stdout = "";
    try {
      if (pyodide) stdout = pyodide.runPython("_stdout_capture.getvalue()") as string || "";
    } catch { /* ignore */ }
    ctx.postMessage({ type: "result", stdout, stderr: msg, error: msg });
  }
};
