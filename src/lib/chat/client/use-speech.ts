"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Voice input with the browser's Web Speech API (Chrome, Edge, Safari, Samsung
 * Internet). Firefox doesn't support it yet → `supported` is false and the UI
 * tells the user. Speech is turned into text on the device/browser vendor; our
 * server only ever receives the final text you send.
 */
type RecognitionResultList = ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
type RecognitionEvent = { resultIndex: number; results: RecognitionResultList };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const noopSubscribe = () => () => {};

const ERROR_TEXT: Record<string, string> = {
  "not-allowed": "Microphone access was blocked. Allow it in your browser's site settings.",
  "service-not-allowed": "Microphone access was blocked. Allow it in your browser's site settings.",
  "no-speech": "I didn't hear anything. Try again a bit closer to the mic.",
  "audio-capture": "No microphone was found.",
  network: "Voice input needs an internet connection.",
};

export function useSpeech({
  onText,
  onError,
  lang,
}: {
  /** Called with final recognised text (append it to the input). */
  onText: (text: string) => void;
  onError: (message: string) => void;
  lang?: string;
}) {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recognitionRef = useRef<Recognition | null>(null);
  const callbacks = useRef({ onText, onError });
  useEffect(() => {
    callbacks.current = { onText, onError };
  });

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      callbacks.current.onError("Voice input isn't supported in this browser. Try Chrome, Edge or Safari.");
      return;
    }
    recognitionRef.current?.abort();
    const recognition = new Ctor();
    recognition.lang = lang ?? (navigator.language || "en-US");
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) callbacks.current.onText(finalText.trim());
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        callbacks.current.onError(
          ERROR_TEXT[event.error] ?? "Voice input stopped unexpectedly. Please try again.",
        );
      }
    };
    recognition.onend = () => {
      setListening(false);
      setInterim("");
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      callbacks.current.onError("Couldn't start voice input. Please try again.");
    }
  }, [lang]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  return { supported, listening, interim, start, stop, toggle: listening ? stop : start };
}
