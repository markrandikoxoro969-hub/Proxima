"use client";

import {
  ArrowUp,
  EyeSlash,
  FileCode,
  FileText,
  ImageSquare,
  Microphone,
  Paperclip,
  Sparkle,
  SpeakerHigh,
  Stop,
  Waveform,
  X,
} from "@phosphor-icons/react";
import { AnimatePresence, m } from "motion/react";
import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ChatMode } from "@/lib/ai/modes";
import { ACCEPT_ATTRIBUTE, formatBytes, readAttachments, type ReadFile } from "@/lib/chat/client/files";
import {
  formatImageSize,
  imageFileProblem,
  uploadDraftImage,
  type DraftImage,
} from "@/lib/chat/client/images";
import { useSpeech } from "@/lib/chat/client/use-speech";
import { useTemporaryChat } from "@/lib/chat/client/use-temporary";
import {
  COMPOSER_MEMES,
  detectComposerMeme,
  type ComposerMemeKind,
} from "@/lib/chat/client/composer-memes";
import { useComposerVibes } from "@/lib/chat/client/use-composer-vibes";
import { cn } from "@/lib/cn";
import { IMAGE_LIMITS } from "@/lib/image/limits";
import { LIMITS } from "@/lib/limits";
import { SPRING } from "@/lib/motion/tokens";
import {
  ComposerMemeStage,
  ComposerPeeker,
  VibeMenu,
  type ActiveComposerMeme,
} from "./composer-vibes";
import { ModeMenu } from "./mode-menu";

const MAX_HEIGHT = 200;

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
  mode,
  onModeChange,
  voice,
  onVoiceInputChange,
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
  /** Answer style (fast / thinking / coding / analyze). */
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
  /** Publishes speech-recognition controls to the chat header. */
  onVoiceInputChange?: (
    control: { listening: boolean; supported: boolean; toggle: () => void } | null,
  ) => void;
  /** Voice mode status/controls. Absent when voice mode is off. */
  voice?: {
    enabled: boolean;
    handsFree: boolean;
    speaking: boolean;
    /** Increments after each spoken reply; opens the mic in hands-free mode. */
    listenSignal: number;
    onStopSpeaking: () => void;
  };
}) {
  const [text, setText] = useState("");
  const [temporary, setTemporary] = useTemporaryChat();
  const [vibes] = useComposerVibes();
  const [files, setFiles] = useState<ReadFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);
  const [activeMeme, setActiveMeme] = useState<ActiveComposerMeme | null>(null);
  const [pokeSignal, setPokeSignal] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const memeTimerRef = useRef<number | null>(null);
  const memeIdRef = useRef(0);
  const lastTriggerRef = useRef<string>("");
  const hintId = useId();

  const triggerMeme = useCallback((kind: ComposerMemeKind, customCaption?: string) => {
    const spec = COMPOSER_MEMES[kind];
    const id = ++memeIdRef.current;
    const caption =
      customCaption ?? spec.captions[id % spec.captions.length] ?? spec.captions[0]!;
    setActiveMeme({ id, kind, caption });
    if (memeTimerRef.current) window.clearTimeout(memeTimerRef.current);
    memeTimerRef.current = window.setTimeout(() => {
      setActiveMeme((current) => (current?.id === id ? null : current));
    }, spec.durationMs);
  }, []);

  const dismissMeme = useCallback(() => {
    if (memeTimerRef.current) window.clearTimeout(memeTimerRef.current);
    setActiveMeme(null);
  }, []);

  useEffect(() => {
    return () => {
      if (memeTimerRef.current) window.clearTimeout(memeTimerRef.current);
    };
  }, []);

  const handleTextChange = useCallback(
    (next: string) => {
      setText(next);
      if (!next.trim()) {
        lastTriggerRef.current = "";
        return;
      }
      if (!vibes.memesEnabled) return;
      if (next.length > LIMITS.messageMax) {
        if (lastTriggerRef.current !== "limit") {
          lastTriggerRef.current = "limit";
          triggerMeme("wasted", "LIMIT EXCEEDED");
        }
        return;
      }
      const match = detectComposerMeme(next);
      if (!match) {
        lastTriggerRef.current = "";
        return;
      }
      const signature = `${match.kind}:${match.matched}`;
      if (signature !== lastTriggerRef.current) {
        lastTriggerRef.current = signature;
        triggerMeme(match.kind, match.caption);
      }
    },
    [vibes.memesEnabled, triggerMeme],
  );

  const length = text.length;
  const tooLong = length > LIMITS.messageMax;
  const uploading = images.some((image) => image.status === "uploading");
  const readyImages = images.filter((image) => image.status === "ready" && image.imageId);
  // A picture on its own is a complete question ("what is this?").
  const canSend = !streaming && !uploading && (text.trim().length > 0 || readyImages.length > 0) && !tooLong;

  const sendPayload = useCallback(
    async (message: string, attachments: { name: string; content: string }[], sendable: SendableImage[]) => {
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
      return started;
    },
    [onSend, files, images, setImages],
  );

  const sendSpoken = useCallback(
    async (spoken: string) => {
      const clean = spoken.trim();
      if (!clean) return;
      if (clean.length > LIMITS.messageMax) {
        setText(clean);
        notify(`Your message is too long (max ${LIMITS.messageMax} characters).`, "error");
        return;
      }
      if (uploading) {
        setText(clean);
        notify("One moment — the picture is still uploading.", "info");
        return;
      }
      const attachments = files.map(({ name, content }) => ({ name, content }));
      const sendable: SendableImage[] = readyImages.map((image) => ({
        id: image.imageId!,
        url: image.url,
        width: image.width,
        height: image.height,
        name: image.name,
      }));
      await sendPayload(clean, attachments, sendable);
    },
    [files, readyImages, uploading, notify, sendPayload],
  );

  const speech = useSpeech({
    onText: (spoken) => {
      // Hands-free sends the transcript straight away, but never while a reply
      // is streaming and never on top of a typed draft or attachments.
      const handsFree =
        voice?.enabled &&
        voice.handsFree &&
        !streaming &&
        !text.trim() &&
        files.length === 0 &&
        images.length === 0;
      if (handsFree) void sendSpoken(spoken);
      else setText((current) => (current.trim() ? `${current.replace(/\s*$/, " ")}${spoken}` : spoken));
    },
    onError: (message) => {
      // Hands-free opens the mic on its own; silence in the room is not an error.
      if (voice?.enabled && voice.handsFree && message.startsWith("I didn't hear anything")) return;
      notify(message, "error");
    },
  });
  const {
    listening,
    interim,
    supported: speechSupported,
    start: startListening,
    stop: stopListening,
    toggle: toggleListening,
  } = speech;

  useEffect(() => {
    onVoiceInputChange?.({ listening, supported: speechSupported, toggle: toggleListening });
  }, [listening, speechSupported, toggleListening, onVoiceInputChange]);

  useEffect(() => () => onVoiceInputChange?.(null), [onVoiceInputChange]);

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

  // Hands-free: one open-mic attempt per spoken reply. The signal is consumed
  // once, so the mic doesn't reopen when recognition ends after a send.
  const handledListen = useRef(0);
  useEffect(() => {
    if (!voice?.enabled || !voice.handsFree) {
      handledListen.current = voice?.listenSignal ?? 0;
      return;
    }
    if (!voice.listenSignal || voice.listenSignal === handledListen.current) return;
    handledListen.current = voice.listenSignal;
    const timer = window.setTimeout(() => {
      const clear = !streaming && !listening && !text.trim() && files.length === 0 && images.length === 0;
      if (clear && speechSupported) startListening();
    }, 550);
    return () => window.clearTimeout(timer);
  }, [
    voice?.enabled,
    voice?.handsFree,
    voice?.listenSignal,
    streaming,
    listening,
    text,
    files.length,
    images.length,
    speechSupported,
    startListening,
  ]);

  // Never listen while Proxima is speaking (the mic would hear the speakers),
  // and close the mic only when voice mode is switched OFF (manual mic use is
  // independent of voice mode).
  const voiceWasEnabled = useRef(voice?.enabled ?? false);
  useEffect(() => {
    const turnedOff = voiceWasEnabled.current && !voice?.enabled;
    voiceWasEnabled.current = voice?.enabled ?? false;
    if ((voice?.speaking || turnedOff) && listening) stopListening();
  }, [voice?.speaking, voice?.enabled, listening, stopListening]);

  const submit = useCallback(async () => {
    if (!canSend) {
      if (tooLong) notify(`Your message is too long (max ${LIMITS.messageMax} characters).`, "error");
      else if (uploading) notify("One moment — the picture is still uploading.", "info");
      return;
    }
    if (listening) stopListening();
    const message = text.trim() ? text : "What's in this picture?";
    const attachments = files.map(({ name, content }) => ({ name, content }));
    const sendable: SendableImage[] = readyImages.map((image) => ({
      id: image.imageId!,
      url: image.url,
      width: image.width,
      height: image.height,
      name: image.name,
    }));
    await sendPayload(message, attachments, sendable);
  }, [canSend, tooLong, uploading, notify, listening, stopListening, text, files, readyImages, sendPayload]);

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
      {voice?.enabled && (
        <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center gap-2 px-1 text-xs">
          <span
            className={cn(
              "inline-flex size-7 items-center justify-center rounded-full border",
              voice.speaking
                ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--accent-text)]"
                : listening
                  ? "border-red-500/30 bg-red-500/10 text-red-500"
                  : "border-line bg-surface-hover text-muted",
            )}
          >
            {voice.speaking ? (
              <SpeakerHigh weight="fill" className="size-3.5 animate-pulse" aria-hidden />
            ) : listening ? (
              <Microphone weight="fill" className="size-3.5 animate-pulse" aria-hidden />
            ) : (
              <Waveform weight="bold" className="size-3.5" aria-hidden />
            )}
            <span className="sr-only" aria-live="polite">
              {voice.speaking ? "Speaking" : listening ? "Listening" : "Voice mode on"}
            </span>
          </span>
          {voice.speaking ? (
            <button
              type="button"
              onClick={voice.onStopSpeaking}
              className="inline-flex min-h-8 items-center rounded-full border border-line px-2.5 font-bold text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
            >
              Stop reading
            </button>
          ) : listening ? (
            <button
              type="button"
              onClick={stopListening}
              className="inline-flex min-h-8 items-center rounded-full border border-line px-2.5 font-bold text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg"
            >
              Stop listening
            </button>
          ) : (
            <button
              type="button"
              onClick={startListening}
              disabled={!speechSupported}
              title={speechSupported ? "Ask with your voice" : "Voice input isn't supported in this browser"}
              className="inline-flex min-h-8 items-center rounded-full border border-line px-2.5 font-bold text-muted transition-colors duration-200 hover:bg-surface-hover hover:text-fg disabled:opacity-40"
            >
              Talk now
            </button>
          )}
          {voice.handsFree && <span className="sr-only">Hands-free is on</span>}
        </div>
      )}

      <form
        className={cn(
          "relative mx-auto w-full max-w-3xl rounded-[1.75rem] glass transition-[box-shadow,border-color] duration-300",
          "focus-within:border-line-strong focus-within:shadow-glow",
          dragging && "border-line-strong shadow-glow-strong",
          activeMeme?.kind === "wasted" && "composer-wasted-ring",
          activeMeme?.kind === "skull" && "composer-skull-ring",
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
        <ComposerMemeStage active={activeMeme} onDismiss={dismissMeme} />
        <ComposerPeeker
          focused={focused}
          typing={text.trim().length > 0}
          streaming={streaming}
          pokeSignal={pokeSignal}
        />
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
          onChange={(e) => handleTextChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={1}
          placeholder={
            listening ? "Listening…" : readyImages.length ? "Ask about the picture…" : "Message Proxima…"
          }
          enterKeyHint="send"
          autoComplete="off"
          spellCheck
          aria-describedby={hintId}
          aria-invalid={tooLong || undefined}
          className="block max-h-[200px] w-full resize-none bg-transparent px-5 pt-4 pb-2 text-base leading-relaxed placeholder:text-subtle focus:outline-none focus-visible:outline-none"
        />
        {interim && (
          <p className="px-5 pb-1 text-sm text-subtle italic" aria-live="polite">
            {interim}
          </p>
        )}
        {tooLong && (
          <p role="alert" className="px-5 pb-2 text-xs font-semibold text-red-500">
            Too long by {length - LIMITS.messageMax} characters. Shorten it to send.
          </p>
        )}

        <div role="group" aria-label="Message actions" className="flex items-center gap-1 px-2 pb-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            <ModeMenu mode={mode} onChange={onModeChange} className="shrink-0" />

            <button
              type="button"
              aria-pressed={temporary}
              aria-label={
                temporary ? "Temporary chat is on. Messages are not saved." : "Start a temporary chat"
              }
              onClick={() => {
                setTemporary(!temporary);
                onTemporaryChange?.();
              }}
              title={temporary ? "Temporary chat is on. Messages are not saved." : "Start a temporary chat"}
              className={cn(
                "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 text-xs font-bold transition-[color,background-color] duration-200",
                temporary
                  ? "bg-[var(--accent)]/12 text-[var(--accent-text)]"
                  : "text-subtle hover:bg-surface-hover hover:text-fg",
              )}
            >
              <EyeSlash weight={temporary ? "fill" : "bold"} className="size-4" aria-hidden />
              <span className="hidden sm:inline">{temporary ? "Temporary on" : "Temporary"}</span>
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
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                if (e.target.files) void addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <AttachMenu
              onPicture={() => imageInputRef.current?.click()}
              onFile={() => fileInputRef.current?.click()}
              onCreateImage={onOpenStudio}
              pictureDisabled={images.length >= IMAGE_LIMITS.perMessage}
              fileDisabled={files.length >= LIMITS.attachmentsMax}
              pictureLimit={IMAGE_LIMITS.perMessage}
              fileLimit={LIMITS.attachmentsMax}
            />

            <VibeMenu
              onTriggerMeme={(kind) => triggerMeme(kind)}
              onPokePeeker={() => setPokeSignal((n) => n + 1)}
            />
          </div>

          <span className="relative inline-grid size-11 shrink-0 place-items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {streaming ? (
                <m.button
                  key="stop"
                  type="button"
                  onClick={() => {
                    if (vibes.memesEnabled) triggerMeme("wasted", "STOPPED");
                    onStop();
                  }}
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
                  className="col-start-1 row-start-1 inline-flex size-11 items-center justify-center rounded-2xl bg-inverse text-on-inverse shadow-glow disabled:opacity-50 disabled:shadow-none"
                >
                  <ArrowUp weight="bold" className="size-5" aria-hidden />
                </m.button>
              )}
            </AnimatePresence>
          </span>
        </div>
      </form>
      <p id={hintId} className="mt-2 text-center text-[11px] font-medium text-subtle">
        <span className="sm:hidden">Tap send when you&apos;re ready</span>
        <span className="hidden sm:inline">Enter sends · Shift + Enter adds a line</span>
        <span className="sr-only">. Your messages are sent over an encrypted connection.</span>
      </p>
    </div>
  );
});

/**
 * One attach button instead of three (picture · file · AI picture).
 *
 * On a 360px phone the old row of six 44px buttons plus the send button
 * overflowed; this keeps every action reachable in a menu that opens upward,
 * with 44px rows. The labels stay the same screen-reader labels as before.
 */
function AttachMenu({
  onPicture,
  onFile,
  onCreateImage,
  pictureDisabled,
  fileDisabled,
  pictureLimit,
  fileLimit,
}: {
  onPicture: () => void;
  onFile: () => void;
  onCreateImage: () => void;
  pictureDisabled: boolean;
  fileDisabled: boolean;
  pictureLimit: number;
  fileLimit: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    {
      id: "picture",
      label: `Attach a picture (up to ${pictureLimit}, 12 MB each)`,
      icon: <ImageSquare weight="bold" className="size-4.5" aria-hidden />,
      run: onPicture,
      disabled: pictureDisabled,
    },
    {
      id: "file",
      label: `Attach text or code files (up to ${fileLimit}, 100 KB each)`,
      icon: <FileCode weight="bold" className="size-4.5" aria-hidden />,
      run: onFile,
      disabled: fileDisabled,
    },
    {
      id: "studio",
      label: "Create or edit a picture with AI",
      icon: <Sparkle weight="fill" className="size-4.5" aria-hidden />,
      run: onCreateImage,
      disabled: false,
    },
  ];

  return (
    // `contents` (not `relative`) makes the panel position itself against the
    // composer form, so it can open left-aligned on a 320px screen instead of
    // running off the right edge.
    <div ref={rootRef} className="contents">
      <IconButton label="Add a picture or file" onClick={() => setOpen((value) => !value)} pressed={open}>
        <Paperclip weight="bold" className="size-5" aria-hidden />
      </IconButton>

      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-label="Add to your message"
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
            event.preventDefault();
            const all = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'));
            const index = all.indexOf(document.activeElement as HTMLElement);
            all[(index + (event.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
          }}
          className="absolute bottom-full left-0 z-40 mb-2 w-[min(18rem,calc(100vw-1.5rem))] origin-bottom-left animate-scale-in rounded-2xl glass-solid p-1.5 shadow-glow-strong"
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.run();
              }}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition-colors duration-150 hover:bg-surface-hover focus:bg-surface-hover focus:outline-none disabled:opacity-40"
            >
              <span className="text-muted">{item.icon}</span>
              <span className="min-w-0 flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function IconButton({
  ref,
  label,
  onClick,
  disabled,
  pressed,
  className,
  children,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cn(
        "inline-flex tap shrink-0 items-center justify-center rounded-2xl text-muted",
        "transition-[color,background-color,transform] duration-200 hover:bg-surface-hover hover:text-fg active:scale-95 disabled:opacity-30",
        className,
      )}
    >
      {children}
    </button>
  );
}
