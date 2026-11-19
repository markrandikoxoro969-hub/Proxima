/**
 * Must be imported BEFORE prismjs. Tells Prism not to scan and rewrite the
 * page by itself (that would fight with React). We call it explicitly.
 */
const g = globalThis as unknown as { Prism?: Record<string, unknown> };
g.Prism = { ...(g.Prism ?? {}), manual: true, disableWorkerMessageHandler: true };

export {};
