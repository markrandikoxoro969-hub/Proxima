"use client";

import {
  ArrowUp,
  EyeSlash,
  FileText,
  ImageSquare,
  Microphone,
  Paperclip,
  Sparkle,
  Stop,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { ACCEPT_ATTRIBUTE, formatBytes, readAttachments, type ReadFile } from "@/lib/chat/client/files";
import {
  formatImageSize,
  imageFileProblem,
  uploadDraftImage,
  type DraftImage,
} from "@/lib/chat/client/images";
import { useSpeech } from "@/lib/chat/client/use-speech";
import { useTemporaryChat } from "@/lib/chat/client/use-temporary";
import { cn } from "@/lib/cn";
import { IMAGE_LIMITS } from "@/lib/image/limits";
import { LIMITS } from "@/lib/limits";
import { SPRING } from "@/lib/motion/tokens";

const MAX_HEIGHT = 200;
const WARN_AT = 3900;

/** What the chat needs to send a picture: its id (the bytes stay on the server). */
export type SendableImage = { id: string; url: string; width: number; height: number; name: string };

/**
 * The message box at the bottom.
 * Enter = send · Shift+Enter = new line · drop files or pictures onto it.
 * Pictures are uploaded (and shrunk) as soon as you pick them; the chip shows
 * the real picture, not a filename.
 */
export const Composer = memo(function Composer({
  onSend,
  onStop,
  streaming,
  notify,
  focusSignal,
  images,
  setImages,
  onOpenStudio,
  onTemporaryChange,
}: {
  onSend: (
    text: string,
    attachments: { name: string; content: string }[],
    images: SendableImage[],
  ) => Promise<boolean>;
  onStop: () => void;
  streaming: boolean;
  notify: (message: string, kind?: "info" | "success" | "error") => void;
  /** Changes when the composer should take focus (new chat, "/" shortcut). */
  focusSignal: number;
  /** Pictures being uploaded or ready to send (kept by the chat screen). */
  images: DraftImage[];
  setImages: React.Dispatch<React.SetStateAction<DraftImage[]>>;
  /** Opens the AI image studio (create / edit pictures). */
  onOpenStudio: () => void;
  /** Start a clean local conversation when temporary mode changes. */
  onTemporaryChange?: () => void;
}) {
  const [text, setText] = useState("");
  const [temporary, setTemporary] = useTemporaryChat();
  const [files, setFiles] = useState<ReadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const counterId = useId();
  const hintId = useId();

  const speech = useSpeech({
    onText: (spoken) =>
      setText((current) => (current.trim() ? `${current.replace(/\s*$/, " ")}${spoken}` : spoken)),
    onError: (message) => notify(message, "error"),
  });

  // Grow with the text, up to MAX_HEIGHT, then scroll inside.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [text]);

  useEffect(() => {
    if (focusSignal > 0) textareaRef.current?.focus({ preventScroll: true });
  }, [focusSignal]);

  const length = text.length;
  const tooLong = length > LIMITS.messageMax;
  const uploading = images.some((image) => image.status === "uploading");
  const readyImages = images.filter((image) => image.status === "ready" && image.imageId);
  // A picture on its own is a complete question ("what is this?").
  const canSend = !streaming && !uploading && (text.trim().length > 0 || readyImages.length > 0) && !tooLong;

  const submit = useCallback(async () => {
    if (!canSend) {
      if (tooLong) notify(`Your message is too long (max ${LIMITS.messageMax} characters).`, "error");
      else if (uploading) notify("One moment — the picture is still uploading.", "info");
      return;
    }
    if (speech.listening) speech.stop();
    const message = text.trim() ? text : "What's in this picture?";
    const attachments = files.map(({ name, content }) => ({ name, content }));
    const sendable: SendableImage[] = readyImages.map((image) => ({
      id: image.imageId!,
      url: image.url,
      width: image.width,
      height: image.height,
      name: image.name,
    }));
    // Clear right away so it feels instant; restore if sending couldn't start.
    setText("");
    setFiles([]);
    setImages([]);
    const started = await onSend(message, attachments, sendable);
    if (!started) {
      setText(message);
      setFiles(files);
      setImages(images);
    }
  }, [canSend, tooLong, uploading, notify, speech, text, files, images, readyImages, onSend, setImages]);

  const addFiles = useCallback(
    async (list: FileList | File[]) => {
      const all = Array.from(list);
      const pictures = all.filter(
        (file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(file.name),
      );
      const others = all.filter((file) => !pictures.includes(file));

      // ── Pictures: validate now, then shrink + upload in the background ──
      const room = Math.max(0, IMAGE_LIMITS.perMessage - images.length);
      const accepted = pictures.slice(0, room).filter((file) => {
        const problem = imageFileProblem(file);
        if (problem) notify(`“${file.name}” ${problem}.`, "error");
        return !problem;
      });
      if (pictures.length > room) {
        notify(`You can attach up to ${IMAGE_LIMITS.perMessage} pictures per message.`, "info");
      }

      if (accepted.length) {
        const placeholders: DraftImage[] = accepted.map((file) => ({
          key: `upload-${file.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name.slice(0, 60),
          size: file.size,
          width: 0,
          height: 0,
          url: "",
          status: "uploading",
        }));
        setImages((current) => [...current, ...placeholders]);
        await Promise.all(
          accepted.map(async (file, index) => {
            const placeholder = placeholders[index];
            try {
              const uploaded = await uploadDraftImage(file);
              setImages((current) =>
                current.map((image) =>
                  image.key === placeholder.key ? { ...uploaded, key: placeholder.key } : image,
                ),
              );
            } catch (error) {
              setImages((current) => current.filter((image) => image.key !== placeholder.key));
              notify((error as Error).message, "error");
            }
          }),
        );
      }

      // ── Text / code files (unchanged behaviour) ──
      if (others.length) {
        const { accepted: textFiles, problems } = await readAttachments(others, files.length);
        if (textFiles.length) setFiles((current) => [...current, ...textFiles]);
        for (const p of problems) notify(`“${p.name}” ${p.reason}.`, "error");
      }
    },
    [files.length, images.length, notify, setImages],
  );

  const removeImage = useCallback(
    (key: string) => setImages((current) => current.filter((image) => image.key !== key)),
    [setImages],
  );

  return (
    <div className="px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <form
        className={cn(
          "relative mx-auto w-full max-w-3xl rounded-[1.75rem] glass transition-[box-shadow,border-color] duration-300",
          "focus-within:border-line-strong focus-within:shadow-glow",
          dragging && "border-line-strong shadow-glow-strong",
        )}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        {(files.length > 0 || images.length > 0) && (
          <div className="flex flex-col gap-2 px-4 pt-3">
            {images.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Pictures to send">
                {images.map((image) => (
                  <li key={image.key} className="relative">
                    <div className="size-20 overflow-hidden rounded-2xl border border-line bg-surface-hover">
                      {image.status === "ready" && image.url ? (
                        // Our own endpoint, so a plain <img> is right (and <Image> can't optimise API routes).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={image.url}
                          alt={image.name}
                          width={image.width || 80}
                          height={image.height || 80}
                          className="size-full object-cover"
                        />
                      ) : (
                        <div className="skeleton size-full" aria-label="Uploading picture" />
                      )}
                    </div>
                    {image.status === "ready" && (
                      <span className="mt-1 block max-w-20 truncate text-[10px] font-semibold text-subtle">
                        {formatImageSize(image.size)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(image.key)}
                      aria-label={`Remove ${image.name}`}
                      className="absolute -top-1.5 -right-1.5 grid size-6 place-items-center rounded-full bg-inverse text-on-inverse shadow"
                    >
                      <X weight="bold" className="size-3" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Files to send">
                {files.map((file) => (
                  <li
                    key={file.id}
                    className="inline-flex h-9 max-w-full items-center gap-2 rounded-full border border-line bg-surface-hover pr-1 pl-3 text-xs font-semibold"
                  >
                    <FileText weight="bold" className="size-4 shrink-0 text-muted" aria-hidden />
                    <span className="max-w-[12rem] truncate">{file.name}</span>
                    <span className="text-subtle">{formatBytes(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((current) => current.filter((f) => f.id !== file.id))}
                      aria-label={`Remove ${file.name}`}
                      className="inline-flex size-7 items-center justify-center rounded-full text-subtle transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
                    >
                      <X weight="bold" className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label htmlFor="composer-input" className="sr-only">
          Message Proxima
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={
            speech.listening
              ? "Listening…"
              : readyImages.length
                ? "Ask about the picture…"
                : "Message Proxima…"
          }
          enterKeyHint="send"
          autoComplete="off"
          spellCheck
          aria-describedby={`${counterId} ${hintId}`}
          aria-invalid={tooLong || undefined}
          className="block max-h-[200px] w-full resize-none bg-transparent px-5 pt-4 pb-2 text-base leading-relaxed placeholder:text-subtle focus:outline-none focus-visible:outline-none"
        />
        {speech.interim && (
          <p className="px-5 pb-1 text-sm text-subtle italic" aria-live="polite">
            {speech.interim}
          </p>
        )}

        <div className="flex items-center gap-1 px-2 pb-2">
          <button
            type="button"
            aria-pressed={temporary}
            onClick={() => {
              setTemporary(!temporary);
              onTemporaryChange?.();
            }}
            title={temporary ? "Temporary chat is on. Messages are not saved." : "Start a temporary chat"}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-[color,background-color] duration-200",
              temporary ? "bg-[var(--accent)]/12 text-[var(--accent-text)]" : "text-subtle hover:bg-surface-hover hover:text-fg",
            )}
          >
            <EyeSlash weight={temporary ? "fill" : "bold"} className="size-4" aria-hidden />
            <span>{temporary ? "Temporary on" : "Temporary"}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={`text/*,application/json,${ACCEPT_ATTRIBUTE}`}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = ""; // allow picking the same file again
            }}
          />
          <input
            ref={imageInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <IconButton
            label={`Attach a picture (up to ${IMAGE_LIMITS.perMessage}, 12 MB each)`}
            onClick={() => imageInputRef.current?.click()}
            disabled={images.length >= IMAGE_LIMITS.perMessage}
          >
            <ImageSquare weight="bold" className="size-5" aria-hidden />
          </IconButton>
          <IconButton
            label={`Attach text or code files (up to ${LIMITS.attachmentsMax}, 100 KB each)`}
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= LIMITS.attachmentsMax}
          >
            <Paperclip weight="bold" className="size-5" aria-hidden />
          </IconButton>
          <IconButton label="Create or edit a picture with AI" onClick={onOpenStudio}>
            <Sparkle weight="fill" className="size-5" aria-hidden />
          </IconButton>
          <IconButton
            label={speech.listening ? "Stop voice input" : "Voice input"}
            onClick={speech.toggle}
            pressed={speech.listening}
            className={cn(
              speech.listening && "bg-red-500/15 text-red-500 hover:bg-red-500/20 hover:text-red-500",
            )}
          >
            <Microphone
              weight={speech.listening ? "fill" : "bold"}
              className={cn("size-5", speech.listening && "animate-pulse")}
              aria-hidden
            />
          </IconButton>

          <span
            id={counterId}
            className={cn(
              "ml-auto px-2 font-mono text-[11px] font-bold tabular-nums transition-opacity duration-200",
              length === 0 && "opacity-0",
              length > WARN_AT ? "text-red-500" : "text-subtle",
            )}
            aria-live={length > WARN_AT ? "polite" : "off"}
          >
            <span className="sr-only">Characters used: </span>
            {length}/{LIMITS.messageMax}
          </span>

          <span className="relative inline-grid size-11 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {streaming ? (
                <m.button
                  key="stop"
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  initial={{ opacity: 0, scale: 0.5, rotate: -90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 90 }}
                  transition={SPRING.snappy}
                  whileTap={{ scale: 0.92 }}
                  className="col-start-1 row-start-1 inline-flex size-11 items-center justify-center rounded-2xl bg-inverse text-on-inverse"
                >
                  <Stop weight="fill" className="size-4" aria-hidden />
                </m.button>
              ) : (
                <m.button
                  key="send"
                  type="submit"
                  disabled={!canSend}
                  aria-label="Send message"
                  initial={{ opacity: 0, scale: 0.5, rotate: 90 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: -90 }}
                  transition={SPRING.snappy}
                  whileTap={{ scale: 0.92 }}
                  className="col-start-1 row-start-1 inline-flex size-11 items-center justify-center rounded-2xl bg-inverse text-on-inverse shadow-glow disabled:opacity-30"
                >
                  <ArrowUp weight="bold" className="size-5" aria-hidden />
                </m.button>
              )}
            </AnimatePresence>
          </span>
        </div>
      </form>
      <p id={hintId} className="mt-2 text-center text-[11px] font-medium text-subtle">
        Enter sends · Shift + Enter adds a line
        <span className="sr-only">. Your messages are sent over an encrypted connection.</span>
      </p>
    </div>
  );
});

function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex tap items-center justify-center rounded-2xl text-muted",
        "transition-[color,background-color,transform] duration-200 hover:bg-surface-hover hover:text-fg active:scale-95 disabled:opacity-30",
        className,
      )}
    >
      {children}
    </button>
  );
}
