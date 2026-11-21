// @vitest-environment node
/**
 * The image API end to end: upload, serve, list, delete, AI generate + edit,
 * and attaching a picture to a chat message.
 * Real Postgres (in memory), the offline image engine, fake login + fake AI.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "@/test/test-db";
import { resetImageProviderCache } from "@/lib/image";
import { signImageId } from "@/lib/image/public-url";
import { ctx, readSse, req } from "./helpers";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  userId: null as string | null,
  aiCalls: [] as { message: string; images?: { mime: string; width: number }[] }[],
}));

vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: (_t, prop) => Reflect.get(state.db as object, prop) }),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(async () => (state.userId ? { user: { id: state.userId } } : null)),
}));
vi.mock("@/lib/ai", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai")>();
  return {
    ...real,
    getAiProvider: () => ({
      id: "fake",
      label: "Fake AI",
      async complete(request: { message: string; images?: { mime: string; width: number }[] }) {
        state.aiCalls.push({ message: request.message, images: request.images });
        return "I can see it.";
      },
    }),
  };
});

const imagesRoute = await import("@/app/api/images/route");
const imageRoute = await import("@/app/api/images/[id]/route");
const generateRoute = await import("@/app/api/images/generate/route");
const editRoute = await import("@/app/api/images/[id]/edit/route");
const sourceRoute = await import("@/app/api/images/[id]/source/route");
const chatRoute = await import("@/app/api/chat/route");

// Route handlers take (request, context); these routes don't use the context.
type Empty = Record<string, never>;
const upload = (request: Request) => imagesRoute.POST(request, {} as Empty);
const list = (request: Request) => imagesRoute.GET(request, {} as Empty);
const serve = (request: Request, context: { params: Promise<{ id: string }> }) =>
  imageRoute.GET(request, context);
const remove = (request: Request, context: { params: Promise<{ id: string }> }) =>
  imageRoute.DELETE(request, context);
const generate = (request: Request) => generateRoute.POST(request, {} as Empty);
const edit = (request: Request, context: { params: Promise<{ id: string }> }) =>
  editRoute.POST(request, context);
const chat = (request: Request) => chatRoute.POST(request, {} as Empty);
const source = (request: Request, context: { params: Promise<{ id: string }> }) =>
  sourceRoute.GET(request, context);

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const pngDataUrl = `data:image/png;base64,${PNG_BASE64}`;

let testDb: TestDb;
let userId: string;
let otherUserId: string;

beforeAll(async () => {
  testDb = await createTestDb();
  state.db = testDb.prisma;
  userId = (await testDb.prisma.user.create({ data: { email: "one@example.com" }, select: { id: true } })).id;
  otherUserId = (
    await testDb.prisma.user.create({ data: { email: "two@example.com" }, select: { id: true } })
  ).id;
  // Offline engine: deterministic, no network, no keys.
  process.env.IMAGE_PROVIDER = "mock";
  // Image engines fetch the source through a signed link, so signing must work.
  process.env.AUTH_SECRET = "test-secret-for-signed-image-links";
});

afterAll(async () => {
  delete process.env.IMAGE_PROVIDER;
  await testDb.close();
});

beforeEach(async () => {
  state.userId = userId;
  state.aiCalls = [];
  await testDb.prisma.rateLimit.deleteMany();
  await testDb.prisma.imageAsset.deleteMany();
});

describe("POST /api/images (upload)", () => {
  it("requires sign-in", async () => {
    state.userId = null;
    const response = await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }));
    expect(response.status).toBe(401);
  });

  it("stores a picture and reports its real size", async () => {
    const response = await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }));
    expect(response.status).toBe(201);
    const { image } = await response.json();
    expect(image).toMatchObject({ mime: "image/png", width: 1, height: 1, source: "upload" });
    expect(image.url).toBe(`/api/images/${image.id}`);

    const served = await serve(req(`/api/images/${image.id}`), ctx(image.id));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
    expect(served.headers.get("cache-control")).toContain("private");
    expect(served.headers.get("content-security-policy")).toContain("sandbox");
    expect(new Uint8Array(await served.arrayBuffer()).length).toBeGreaterThan(50);
  });

  it("refuses files that aren't pictures, and explains why", async () => {
    const text = await upload(
      req("/api/images", {
        method: "POST",
        body: { dataUrl: `data:image/png;base64,${btoa("hello world")}` },
      }),
    );
    expect(text.status).toBe(400);
    expect((await text.json()).error.message).toMatch(/PNG, JPEG or WebP/);

    const svg = await upload(
      req("/api/images", {
        method: "POST",
        body: {
          dataUrl: `data:image/svg+xml;base64,${btoa('<svg xmlns="http://www.w3.org/2000/svg"></svg>')}`,
        },
      }),
    );
    expect(svg.status).toBe(400);
    expect((await svg.json()).error.message).toMatch(/SVG/);
  });

  it("keeps other people's pictures private", async () => {
    const response = await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }));
    const { image } = await response.json();

    state.userId = otherUserId;
    const hidden = await serve(req(`/api/images/${image.id}`), ctx(image.id));
    expect(hidden.status).toBe(404);

    const notMine = await remove(req(`/api/images/${image.id}`, { method: "DELETE" }), ctx(image.id));
    expect(notMine.status).toBe(404);
  });

  it("deletes a picture", async () => {
    const { image } = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();
    const deleted = await remove(req(`/api/images/${image.id}`, { method: "DELETE" }), ctx(image.id));
    expect(deleted.status).toBe(204);
    expect((await serve(req(`/api/images/${image.id}`), ctx(image.id))).status).toBe(404);
  });
});

describe("GET /api/images/:id/source (signed link for AI engines)", () => {
  const signedPath = (id: string, expires = Date.now() + 60_000) =>
    `/api/images/${id}/source?exp=${expires}&sig=${signImageId(id, expires)}`;

  it("serves the picture to anyone holding a valid, unexpired signature", async () => {
    const { image } = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();

    state.userId = otherUserId;
    const signed = await source(req(signedPath(image.id)), ctx(image.id));
    expect(signed.status).toBe(200);
    expect(signed.headers.get("content-type")).toBe("image/png");
    expect(signed.headers.get("cache-control")).toContain("private");
    expect(signed.headers.get("x-robots-tag")).toContain("noindex");
    expect(new Uint8Array(await signed.arrayBuffer()).length).toBeGreaterThan(50);
  });

  it("refuses a missing, wrong or expired signature", async () => {
    const { image } = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();

    expect((await source(req(`/api/images/${image.id}/source`), ctx(image.id))).status).toBe(404);
    expect(
      (await source(req(`/api/images/${image.id}/source?exp=9999999999999&sig=nope`), ctx(image.id))).status,
    ).toBe(404);
    expect((await source(req(signedPath(image.id, Date.now() - 1000)), ctx(image.id))).status).toBe(404);
  });

  it("can't be used to read a different picture", async () => {
    const first = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();
    const second = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();
    // Signature made for the first picture, pointed at the second one.
    const stolen = signedPath(first.image.id).replace(first.image.id, second.image.id);
    expect((await source(req(stolen), ctx(second.image.id))).status).toBe(404);
  });
});

describe("POST /api/images/generate", () => {
  it("creates a picture, says it's the offline engine, and lists it", async () => {
    const response = await generate(
      req("/api/images/generate", {
        method: "POST",
        body: { prompt: "a red boat on a lake", width: 512, height: 512, style: "photo" },
      }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.offline).toBe(true);
    expect(body.engine.id).toContain("mock");
    expect(body.image).toMatchObject({ source: "generated", width: 512, height: 512 });
    expect(body.image.prompt).toContain("photorealistic");

    const stored = await testDb.prisma.imageAsset.findUniqueOrThrow({ where: { id: body.image.id } });
    expect(stored.mime).toBe("image/svg+xml");
    expect(stored.userId).toBe(userId);

    const gallery = await (await list(req("/api/images"))).json();
    expect(gallery.images[0].id).toBe(body.image.id);
  });

  it("validates the prompt", async () => {
    const short = await generate(req("/api/images/generate", { method: "POST", body: { prompt: "  " } }));
    expect(short.status).toBe(400);
    expect((await short.json()).error.code).toBe("validation_error");

    const huge = await generate(
      req("/api/images/generate", { method: "POST", body: { prompt: "x".repeat(2000) } }),
    );
    expect(huge.status).toBe(400);
  });

  it("limits how often one person can generate", async () => {
    const body = { prompt: "a small test picture" };
    for (let i = 0; i < 6; i++) {
      const ok = await generate(req("/api/images/generate", { method: "POST", body }));
      expect(ok.status).toBe(200);
    }
    const limited = await generate(req("/api/images/generate", { method: "POST", body }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("POST /api/images/:id/edit", () => {
  it("edits a stored picture and links it to the original", async () => {
    const { image } = await (
      await generate(req("/api/images/generate", { method: "POST", body: { prompt: "a quiet forest path" } }))
    ).json();

    const response = await edit(
      req(`/api/images/${image.id}/edit`, {
        method: "POST",
        body: { prompt: "make it snowy", strength: 0.7 },
      }),
      ctx(image.id),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.original).toBe(image.id);
    expect(body.image.source).toBe("edited");
    expect(body.image.id).not.toBe(image.id);

    const stored = await testDb.prisma.imageAsset.findUniqueOrThrow({ where: { id: body.image.id } });
    expect(stored.parentId).toBe(image.id);
    expect(stored.prompt).toContain("snowy");
  });

  it("can't edit somebody else's picture", async () => {
    const { image } = await (
      await generate(req("/api/images/generate", { method: "POST", body: { prompt: "a quiet forest path" } }))
    ).json();
    state.userId = otherUserId;
    const response = await edit(
      req(`/api/images/${image.id}/edit`, { method: "POST", body: { prompt: "make it snowy" } }),
      ctx(image.id),
    );
    expect(response.status).toBe(404);
  });
});

describe("editing through NVIDIA FLUX.1 Kontext", () => {
  // Stands in for ai.api.nvidia.com: captures the request, answers an artifact.
  const realFetch = globalThis.fetch;
  let calls: { url: URL; init?: RequestInit }[] = [];

  beforeEach(() => {
    calls = [];
    process.env.IMAGE_PROVIDER = "nvidia";
    process.env.IMAGE_GENERATION = "gen-test-key";
    process.env.IMAGE_EDITING = "edit-test-key";
    resetImageProviderCache();
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: new URL(String(input)), init });
      return Response.json({ artifacts: [{ base64: PNG_BASE64, finishReason: "SUCCESS" }] });
    }) as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    process.env.IMAGE_PROVIDER = "mock";
    delete process.env.IMAGE_GENERATION;
    delete process.env.IMAGE_EDITING;
    resetImageProviderCache();
  });

  it("sends the picture inline to Kontext with the editing key", async () => {
    const { image } = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();

    const response = await edit(
      req(`/api/images/${image.id}/edit`, { method: "POST", body: { prompt: "make it snowy" } }),
      ctx(image.id),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    // The chain reports every engine it could fall back to, in order.
    expect(body.engine.id.startsWith("nvidia")).toBe(true);
    expect(body.original).toBe(image.id);

    expect(calls).toHaveLength(1);
    expect(calls[0].url.pathname).toBe("/v1/genai/black-forest-labs/flux.1-kontext-dev");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer edit-test-key");
    const payload = JSON.parse(String(calls[0].init?.body));
    expect(payload.prompt).toContain("snowy");
    expect(payload.image).toBe(pngDataUrl);
  });
});

describe("pictures in a chat message", () => {
  it("stores picture details and hands the bytes to the AI", async () => {
    const { image } = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();

    const response = await chat(
      req("/api/chat", {
        method: "POST",
        body: { message: "What is in this picture?", images: [{ id: image.id }] },
      }),
    );
    expect(response.status).toBe(200);
    const events = await readSse(response);
    expect(events.some((event) => event.event === "done")).toBe(true);

    expect(state.aiCalls).toHaveLength(1);
    expect(state.aiCalls[0].images?.[0]).toMatchObject({ mime: "image/png", width: 1 });
    expect(state.aiCalls[0].message).toContain("picture is attached");

    const stored = await testDb.prisma.message.findFirstOrThrow({ where: { role: "user" } });
    const attachments = stored.attachments as { kind?: string; imageId?: string; url?: string }[];
    expect(attachments[0]).toMatchObject({
      kind: "image",
      imageId: image.id,
      url: `/api/images/${image.id}`,
    });
  });

  it("refuses a picture that belongs to someone else", async () => {
    state.userId = otherUserId;
    const { image } = await (
      await upload(req("/api/images", { method: "POST", body: { dataUrl: pngDataUrl } }))
    ).json();
    state.userId = userId;

    const response = await chat(
      req("/api/chat", {
        method: "POST",
        body: { message: "What is in this picture?", images: [{ id: image.id }] },
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/no longer available/i);
  });

  it("asks guests to sign in", async () => {
    state.userId = null;
    const response = await chat(
      req("/api/chat", {
        method: "POST",
        body: { message: "hi", images: [{ id: "cm00000000000000000000000" }] },
      }),
    );
    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toMatch(/sign in/i);
  });
});
