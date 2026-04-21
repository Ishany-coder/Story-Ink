"use client";

import { useEffect, useRef, useState } from "react";

// ElevenLabs IVC wants a 30-60s sample with varied phonetics. This paragraph
// is tuned for that: mixed vowels, plosives, soft fricatives, a rhythm
// change, and a short exclamation.
const SAMPLE_SCRIPT = `Once upon a twilight meadow, a curious little fox trotted between the tall grass, whispering wishes to the fireflies. She loved chocolate, cherries, and the crunch of crisp autumn leaves. "Wait for me!" she called, leaping over a stream of cold, silver water, while somewhere beyond the hills the first snow began to fall. Every evening she told herself a new story, and every morning she set out to make it come true.`;

interface Props {
  open: boolean;
  onClose: () => void;
  onCloned: (voiceId: string, name: string) => void;
  // Used when re-recording, to surface a "replaces current voice" hint.
  existingVoiceName?: string | null;
}

type RecorderState = "idle" | "recording" | "recorded";

export default function NarratorSetup({
  open,
  onClose,
  onCloned,
  existingVoiceName,
}: Props) {
  const [tab, setTab] = useState<"record" | "upload">("record");
  const [recorderState, setRecorderState] = useState<RecorderState>("idle");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobFilename, setBlobFilename] = useState<string>("sample.webm");
  const [elapsed, setElapsed] = useState(0);
  const [voiceName, setVoiceName] = useState(
    existingVoiceName ?? "My voice"
  );
  const [consented, setConsented] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up any in-flight recording + mic stream when the modal closes, so
  // the user's mic indicator actually goes away.
  useEffect(() => {
    if (open) return;
    stopTracks();
    setRecorderState("idle");
    setBlob(null);
    setElapsed(0);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === "Escape" && !uploading) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, uploading]);

  function stopTracks() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  async function startRecording() {
    setError(null);
    setBlob(null);
    setElapsed(0);
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "Microphone access was denied. Allow mic permission in your browser and try again, or switch to the upload tab."
      );
      return;
    }
    streamRef.current = stream;

    // Pick a mime the browser actually supports. Safari doesn't do webm;
    // fall back to mp4/m4a there.
    const preferred = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    const mime =
      preferred.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const ext = mime.includes("webm")
      ? "webm"
      : mime.includes("mp4")
        ? "m4a"
        : mime.includes("ogg")
          ? "ogg"
          : "webm";
    setBlobFilename(`sample.${ext}`);

    const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.onstop = () => {
      const finalBlob = new Blob(chunksRef.current, {
        type: mr.mimeType || mime || "audio/webm",
      });
      setBlob(finalBlob);
      setRecorderState("recorded");
      stopTracks();
    };
    mr.start();
    setRecorderState("recording");

    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
  }

  function handleUploadFile(file: File) {
    setError(null);
    setBlob(file);
    setBlobFilename(file.name);
    setRecorderState("recorded");
  }

  async function submit() {
    if (!blob) {
      setError("Record or upload a sample first.");
      return;
    }
    if (!consented) {
      setError("Please confirm the consent checkbox.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", blob, blobFilename);
      form.append("name", voiceName || "My voice");
      form.append("consented", "true");
      const res = await fetch("/api/voice/clone", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Clone failed (${res.status})`);
      }
      const { voiceId, name } = (await res.json()) as {
        voiceId: string;
        name: string;
      };
      onCloned(voiceId, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  const mmss = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-purple-900/50 p-4 backdrop-blur-sm"
      onClick={() => !uploading && onClose()}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-4 border-purple-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b-2 border-purple-100 px-6 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-purple-400">
              Narrator · one-time setup
            </p>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-bold text-purple-700">
              {existingVoiceName ? "Re-record your voice" : "Record your voice"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="flex h-8 w-8 items-center justify-center rounded-full text-purple-400 hover:bg-purple-50 hover:text-purple-600 disabled:opacity-50"
            aria-label="Close"
          >
            &times;
          </button>
        </header>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-2xl border-2 border-purple-100 bg-purple-50/50 px-4 py-3 text-xs leading-relaxed text-purple-600">
            <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-purple-400">
              Read this paragraph clearly (30-60 seconds)
            </p>
            <p className="italic">{SAMPLE_SCRIPT}</p>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {(["record", "upload"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                disabled={uploading}
                className={`rounded-xl px-3 py-2 text-xs font-black uppercase tracking-wider transition-all ${
                  tab === t
                    ? "bg-purple-500 text-white shadow"
                    : "bg-purple-50 text-purple-400 hover:bg-purple-100"
                }`}
              >
                {t === "record" ? "Record in browser" : "Upload a file"}
              </button>
            ))}
          </div>

          {tab === "record" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-purple-200 bg-purple-50/30 px-4 py-6">
              {recorderState === "idle" && (
                <button
                  type="button"
                  onClick={startRecording}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-3 text-sm font-black uppercase text-white shadow hover:scale-[1.02]"
                >
                  <span className="inline-block h-3 w-3 rounded-full bg-white" />
                  Start recording
                </button>
              )}
              {recorderState === "recording" && (
                <>
                  <div className="flex items-center gap-2 text-rose-500">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-rose-500" />
                    </span>
                    <span className="text-sm font-black uppercase tracking-wider">
                      Recording… {mmss(elapsed)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="rounded-2xl bg-purple-500 px-6 py-2 text-sm font-black uppercase text-white shadow hover:scale-[1.02]"
                  >
                    Stop
                  </button>
                </>
              )}
              {recorderState === "recorded" && blob && (
                <>
                  <audio
                    controls
                    src={URL.createObjectURL(blob)}
                    className="w-full max-w-sm"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setBlob(null);
                      setRecorderState("idle");
                      setElapsed(0);
                    }}
                    disabled={uploading}
                    className="text-[11px] font-black uppercase text-purple-400 hover:text-purple-600"
                  >
                    Re-record
                  </button>
                </>
              )}
            </div>
          )}

          {tab === "upload" && (
            <label className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50/40 px-4 py-8 text-center text-sm font-bold text-purple-500 hover:bg-purple-100">
              <span className="text-2xl">&#127925;</span>
              <span className="mt-2">
                {blob && recorderState === "recorded" && tab === "upload"
                  ? blobFilename
                  : "Upload an audio file"}
              </span>
              <span className="mt-0.5 text-[10px] font-medium text-purple-300">
                wav / mp3 / m4a / webm · max 10 MB
              </span>
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadFile(f);
                  e.target.value = "";
                }}
              />
            </label>
          )}

          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-400">
              Voice name
            </span>
            <input
              type="text"
              value={voiceName}
              onChange={(e) => setVoiceName(e.target.value)}
              maxLength={60}
              disabled={uploading}
              className="mt-1 w-full rounded-xl border-2 border-purple-200 bg-white px-3 py-1.5 text-sm font-bold text-purple-700 outline-none focus:border-purple-400"
            />
          </label>

          <label className="flex items-start gap-2 rounded-xl border-2 border-purple-100 bg-purple-50/40 px-3 py-2 text-[11px] leading-snug text-purple-600">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              disabled={uploading}
              className="mt-0.5 accent-purple-500"
            />
            <span>
              I confirm this is my own voice, or I have explicit permission
              from the speaker to clone their voice for narration in this
              app.
            </span>
          </label>

          {error && (
            <div className="rounded-xl bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-500">
              {error}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t-2 border-purple-100 bg-purple-50/40 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-2xl bg-white px-4 py-2 text-xs font-black uppercase text-purple-500 ring-1 ring-purple-200 hover:bg-purple-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={uploading || !blob || !consented}
            className="rounded-2xl bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 px-5 py-2 text-xs font-black uppercase text-white shadow disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Cloning voice…" : "Save voice"}
          </button>
        </footer>
      </div>
    </div>
  );
}
