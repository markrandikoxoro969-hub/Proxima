"use client";

import {
  ArrowClockwise,
  ChatCircleText,
  DownloadSimple,
  ImageSquare,
  PencilSimple,
  Sparkle,
  Trash,
  UploadSimple,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { api, ClientApiError } from "@/lib/chat/client/api";
import { imageFileProblem, shrinkImageFile } from "@/lib/chat/client/images";
import { cn } from "@/lib/cn";
import { IMAGE_LIMITS, IMAGE_SIZES, IMAGE_STYLES, findImageSize } from "@/lib/image/limits";
import type { ImageDTO } from "@/lib/image/types";

type Mode = "create" | "edit";
type Notify = (message: string, kind?: "info" | "success" | "error") => void;

const EXAMPLES = [
  "A neon city in the rain, cinematic",
  "Portrait of an astronaut botanist, soft light",
  "Cozy cabin in a snowy forest, warm windows",
  "A paper boat on a tiny sea, minimalist",
];

const EDIT_EXAMPLES = [
  "Make it look like a watercolour painting",
  "Add a dramatic sunset sky",
  "Turn it into a snowy winter scene",
  "Make the colours warmer and softer",
];

/**
 * Image studio — create a picture from a prompt, or change one with AI.
 *
 * Everything happens here rather than inside the chat so the conversation
 * stays a conversation: results land in a gallery you can download, edit
 * again, or attach to a message ("Use in chat").
 *
 * Signed in only: each picture costs an API call and uses storage.
 */
export function ImageStudio({
  open,
  onClose,
  notify,
  onUseInChat,
}: {
  open: boolean;
  onClose: () => void;
  notify: Notify;
  /** Adds the picture to the message box so it can be sent with a question. */
  onUseInChat: (image: ImageDTO) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Image studio"
      description="Describe a picture. Or upload one and describe the change."
      className="max-w-3xl"
    >
      {open && <StudioBody notify={notify} onUseInChat={onUseInChat} onClose={onClose} />}
    </Dialog>
  );
}

function StudioBody({
  notify,
  onUseInChat,
  onClose,
}: {
  notify: Notify;
  onUseInChat: (image: ImageDTO) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("create");
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string | null>(null);
  const [sizeId, setSizeId] = useState<string>(IMAGE_SIZES[0].id);
  const [strength, setStrength] = useState(0.55);
  const [source, setSource] = useState<ImageDTO | null>(null);
  const [result, setResult] = useState<ImageDTO | null>(null);
  const [recent, setRecent] = useState<ImageDTO[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<{ label: string; offline: boolean; note?: string | null } | null>(
    null,
  );
  /** Shown before the first picture: honest note about the current engine. */
  const [engineNote, setEngineNote] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const promptId = useId();
  const strengthId = useId();
  const size = findImageSize(sizeId);

  const loadRecent = useCallback(async () => {
    try {
      const { images, engine: info } = await api.listImages();
      setRecent(images);
      if (info?.note) setEngineNote(info.note);
      setSource((current) => current ?? images.find((image) => image.source !== "upload") ?? null);
    } catch {
      /* the studio still works without the gallery */
    }
  }, []);

  // Load the gallery once when the studio opens (it's remounted each time).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { images, engine: info } = await api.listImages();
        if (cancelled) return;
        setRecent(images);
        if (info?.note) setEngineNote(info.note);
        setSource(images.find((image) => image.source !== "upload") ?? null);
      } catch {
        /* the studio still works without the gallery */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addRecent = (image: ImageDTO) =>
    setRecent((current) =>
      [image, ...current.filter((item) => item.id !== image.id)].slice(0, IMAGE_LIMITS.galleryMax),
    );

  const run = async (kind: "create" | "edit") => {
    if (prompt.trim().length < 3) {
      setError("Describe what you want in a few words.");
      return;
    }
    if (kind === "edit" && !source) {
      setError("Upload a picture first, or pick one from your gallery.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response =
        kind === "create"
          ? await api.generateImage({
              prompt: prompt.trim(),
              width: size.width,
              height: size.height,
              style: style ?? undefined,
            })
          : await api.editImage(source!.id, { prompt: prompt.trim(), strength });

      setResult(response.image);
      addRecent(response.image);
      setEngine({ label: response.engine.label, offline: response.offline, note: response.engine.note });
      setEngineNote(response.engine.note ?? null);
      notify(kind === "create" ? "Picture created." : "Picture edited.", "success");
    } catch (caught) {
      const message =
        caught instanceof ClientApiError
          ? caught.message
          : (caught as Error)?.message || "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const uploadSource = async (file: File) => {
    const problem = imageFileProblem(file);
    if (problem) {
      setError(`“${file.name}” ${problem}.`);
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const shrunk = await shrinkImageFile(file, "webp");
      const { image } = await api.uploadImage(shrunk.dataUrl, file.name);
      addRecent(image);
      setSource(image);
      setMode("edit");
      notify("Picture ready to edit.", "success");
    } catch (caught) {
      setError((caught as Error)?.message || "That picture couldn't be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const removeImage = async (image: ImageDTO) => {
    try {
      await api.deleteImage(image.id);
      setRecent((current) => current.filter((item) => item.id !== image.id));
      if (result?.id === image.id) setResult(null);
      if (source?.id === image.id) setSource(null);
      notify("Picture deleted.", "success");
    } catch (caught) {
      notify((caught as Error).message, "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Create / Edit */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-surface-hover p-1">
        {(
          [
            { id: "create", label: "Create", icon: <Sparkle weight="fill" className="size-4" aria-hidden /> },
            {
              id: "edit",
              label: "Edit a picture",
              icon: <PencilSimple weight="bold" className="size-4" aria-hidden />,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMode(tab.id)}
            aria-pressed={mode === tab.id}
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors duration-200",
              mode === tab.id ? "bg-inverse text-on-inverse" : "text-muted hover:text-fg",
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "edit" && (
        <div className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-hover">
            {source ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={source.url} alt="" className="size-full object-cover" />
            ) : uploading ? (
              <Spinner label="Uploading picture" className="size-5 text-muted" />
            ) : (
              <ImageSquare weight="bold" className="size-6 text-subtle" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{source ? "Picture to change" : "Choose a picture"}</p>
            <p className="truncate text-xs text-muted">
              {source
                ? (source.prompt?.slice(0, 70) ?? "Uploaded picture")
                : "Upload one, or pick a recent picture below."}
            </p>
          </div>
          <input
            ref={uploadRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadSource(file);
              event.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => uploadRef.current?.click()} disabled={uploading || busy}>
            <UploadSimple weight="bold" className="size-4" aria-hidden /> Upload
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={promptId}
          className="text-[11px] font-extrabold tracking-[0.2em] text-muted uppercase"
        >
          {mode === "create" ? "Describe the picture" : "Describe the change"}
        </label>
        <textarea
          id={promptId}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={IMAGE_LIMITS.promptMax}
          rows={3}
          placeholder={
            mode === "create"
              ? "A lighthouse at dusk, long exposure, warm light…"
              : "Make the sky stormy and add rain…"
          }
          className="w-full resize-none rounded-2xl border border-line-strong bg-surface-solid px-4 py-3 text-sm leading-relaxed font-medium placeholder:text-subtle focus:border-fg focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {(mode === "create" ? EXAMPLES : EDIT_EXAMPLES).map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setPrompt(example)}
              className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted transition-colors duration-200 hover:border-line-strong hover:text-fg"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {mode === "create" ? (
        <>
          <fieldset>
            <legend className="mb-1.5 text-[11px] font-extrabold tracking-[0.2em] text-muted uppercase">
              Style
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_STYLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setStyle((current) => (current === option.id ? null : option.id))}
                  aria-pressed={style === option.id}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200",
                    style === option.id
                      ? "border-fg/40 bg-inverse text-on-inverse"
                      : "border-line text-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-1.5 text-[11px] font-extrabold tracking-[0.2em] text-muted uppercase">
              Shape
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {IMAGE_SIZES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSizeId(option.id)}
                  aria-pressed={sizeId === option.id}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-bold transition-colors duration-200",
                    sizeId === option.id
                      ? "border-fg/40 bg-inverse text-on-inverse"
                      : "border-line text-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  {option.label} <span className="opacity-60">{option.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={strengthId}
            className="text-[11px] font-extrabold tracking-[0.2em] text-muted uppercase"
          >
            How far to change it · {Math.round(strength * 100)}%
          </label>
          <input
            id={strengthId}
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={strength}
            onChange={(event) => setStrength(Number(event.target.value))}
            className="w-full accent-[var(--accent)]"
          />
          <p className="text-[11px] text-subtle">
            Low keeps the original closely; high allows bigger changes.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button
          size="lg"
          onClick={() => void run(mode)}
          disabled={busy || uploading || prompt.trim().length < 3}
          className="sm:flex-1"
        >
          {busy ? (
            <Spinner className="size-4" label="Working" />
          ) : (
            <Sparkle weight="fill" className="size-4" aria-hidden />
          )}
          {busy ? "Working…" : mode === "create" ? "Generate picture" : "Apply change"}
        </Button>
        {result && (
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              onUseInChat(result);
              onClose();
            }}
          >
            <ChatCircleText weight="bold" className="size-4" aria-hidden /> Use in chat
          </Button>
        )}
      </div>

      <p aria-live="polite" className="min-h-5 text-xs font-semibold text-subtle">
        {busy
          ? mode === "create"
            ? "Painting… this can take up to a minute."
            : "Editing… this can take up to a minute."
          : ""}
      </p>

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3 text-sm font-semibold"
        >
          {error}
        </p>
      )}

      {result && (
        <figure className="overflow-hidden rounded-2xl border border-line bg-surface-hover/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={result.url}
            alt={result.prompt ?? "Generated picture"}
            width={result.width}
            height={result.height}
            className="max-h-[46vh] w-full object-contain"
          />
          <figcaption className="flex flex-wrap items-center gap-1 border-t border-line p-2">
            <p className="mr-auto min-w-0 flex-1 truncate px-1 text-xs font-semibold text-muted">
              {result.prompt ?? "Picture"}
            </p>
            <a
              href={result.url}
              download={`proxima-${result.id}.${result.mime.split("/")[1] ?? "png"}`}
              className="inline-flex tap items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
            >
              <DownloadSimple weight="bold" className="size-4" aria-hidden /> Download
            </a>
            <button
              type="button"
              onClick={() => {
                setSource(result);
                setMode("edit");
                setPrompt("");
              }}
              className="inline-flex tap items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
            >
              <PencilSimple weight="bold" className="size-4" aria-hidden /> Edit this
            </button>
            <button
              type="button"
              onClick={() => void removeImage(result)}
              aria-label="Delete this picture"
              className="inline-flex tap items-center justify-center rounded-xl px-2.5 text-muted transition-colors duration-200 hover:bg-red-500/10 hover:text-red-500"
            >
              <Trash weight="bold" className="size-4" aria-hidden />
            </button>
          </figcaption>
        </figure>
      )}

      <div className="border-t border-line pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-extrabold tracking-[0.2em] text-muted uppercase">Recent pictures</p>
          <button
            type="button"
            onClick={() => void loadRecent()}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-muted hover:text-fg"
          >
            <ArrowClockwise weight="bold" className="size-3.5" aria-hidden /> Refresh
          </button>
        </div>

        {recent.length === 0 ? (
          <p className="text-xs text-subtle">Nothing yet. Your creations and uploads appear here.</p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {recent.map((image) => (
              <li key={image.id} className="group relative">
                <button
                  type="button"
                  onClick={() => {
                    setSource(image);
                    setMode("edit");
                    setResult(null);
                    setPrompt("");
                  }}
                  className="block w-full overflow-hidden rounded-xl border border-line transition-[border-color,transform] duration-200 hover:border-line-strong active:scale-[0.98]"
                  aria-label={`Edit ${image.prompt ?? "picture"}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt={image.prompt?.slice(0, 60) ?? "Saved picture"}
                    width={image.width}
                    height={image.height}
                    loading="lazy"
                    decoding="async"
                    className="aspect-square w-full object-cover"
                  />
                </button>
                <button
                  type="button"
                  onClick={() => void removeImage(image)}
                  aria-label="Delete picture"
                  className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/50 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <Trash weight="bold" className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 space-y-1 text-[11px] text-subtle">
          <p>
            {engine
              ? engine.offline
                ? `Offline preview (${engine.label}). Add IMAGE_GENERATION or OPENAI_API_KEY on the server for real artwork — see docs/IMAGES.md.`
                : `Made with ${engine.label}.`
              : "Pictures are private to your account. Older ones are removed automatically once you have 120."}
          </p>
          {(engine?.note ?? engineNote) && !engine?.offline && (
            <p className="text-muted">{engine?.note ?? engineNote}</p>
          )}
        </div>
      </div>
    </div>
  );
}
