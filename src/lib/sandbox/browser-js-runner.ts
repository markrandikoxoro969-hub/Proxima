import type { JsEvaluator } from "./command-prompt";

const EXEC_TIMEOUT_MS = 2_500;

/**
 * Executes JavaScript in the browser inside a detached, isolated
 * `<iframe sandbox="allow-scripts">` (NO `allow-same-origin`) so commands like
 * `node app.js` or `node -e "console.log(2+2)"` run genuinely and safely
 * without any access to Proxima cookies, storage, or parent DOM.
 */
export const browserSandboxedJsEvaluator: JsEvaluator = (code, files) => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { stdout: "", stderr: "Browser runtime unavailable.", exitCode: 1 };
  }

  return new Promise((resolve) => {
    const runId = `js-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.display = "none";
    iframe.setAttribute("aria-hidden", "true");

    const fileMap: Record<string, string> = {};
    for (const f of files) fileMap[f.path] = f.content;

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      iframe.remove();
    };

    const timer = window.setTimeout(() => {
      cleanup();
      resolve({
        stdout: "",
        stderr: `Execution timed out after ${EXEC_TIMEOUT_MS}ms.`,
        exitCode: 124,
      });
    }, EXEC_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as {
        __proximaJsRun?: boolean;
        runId?: string;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
      } | null;
      if (!data || !data.__proximaJsRun || data.runId !== runId) return;
      cleanup();
      resolve({
        stdout: typeof data.stdout === "string" ? data.stdout : "",
        stderr: typeof data.stderr === "string" ? data.stderr : "",
        exitCode: typeof data.exitCode === "number" ? data.exitCode : 0,
      });
    };

    window.addEventListener("message", onMessage);

    const safeCode = code.replace(/<\/script/gi, "<\\/script");
    const safeFilesJson = JSON.stringify(fileMap).replace(/<\/script/gi, "<\\/script");

    iframe.srcdoc = `<!DOCTYPE html><html><head><meta charset="utf-8"><script>
(function(){
  var RUN_ID = ${JSON.stringify(runId)};
  var out = [];
  var err = [];
  window.__workspaceFiles = ${safeFilesJson};
  function fmt(v){
    if(v instanceof Error) return v.stack || v.message;
    if(typeof v === "string") return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  console.log = function(){ out.push(Array.prototype.map.call(arguments, fmt).join(" ")); };
  console.info = console.log;
  console.warn = function(){ err.push(Array.prototype.map.call(arguments, fmt).join(" ")); };
  console.error = function(){ err.push(Array.prototype.map.call(arguments, fmt).join(" ")); };
  function done(exitCode){
    parent.postMessage({
      __proximaJsRun: true,
      runId: RUN_ID,
      stdout: out.join("\\n"),
      stderr: err.join("\\n"),
      exitCode: exitCode
    }, "*");
  }
  try {
    var result = (function(){
${safeCode}
    })();
    if (result && typeof result.then === "function") {
      result.then(function(val){
        if (out.length === 0 && val !== undefined) out.push(fmt(val));
        done(0);
      }, function(e){
        err.push(fmt(e));
        done(1);
      });
    } else {
      if (out.length === 0 && result !== undefined) out.push(fmt(result));
      done(0);
    }
  } catch (e) {
    err.push(fmt(e));
    done(1);
  }
})();
</script></head><body></body></html>`;

    document.body.appendChild(iframe);
  });
};
