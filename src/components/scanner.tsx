"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, ImageUp, QrCode, ArrowLeft } from "lucide-react";
import jsQR from "jsqr";
import { joinToken } from "@/lib/join-token";
import { JoinForm } from "./join-form";
export function Scanner() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const active = useRef(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const file = useRef<HTMLInputElement>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Choose camera or upload a QR image.");
  const stop = useCallback(() => {
    active.current = false;
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    if (mounted.current) {
      setRunning(false);
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      stop();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [stop]);
  function accept(value: string) {
    const token = joinToken(value);
    if (!token) {
      setError(
        "That is not a VibePub join code. Point the camera at the pub’s entrance or table QR.",
      );
      return false;
    }
    stop();
    setStatus("QR found. Joining your pub…");
    window.location.assign(`/join/${token}`);
    return true;
  }
  async function start() {
    stop();
    setError("");
    if (!window.isSecureContext) {
      setError(
        "Camera scanning needs HTTPS. Upload a QR image or paste the pub link below.",
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser cannot open a camera. Upload a QR image or paste the pub link instead.",
      );
      return;
    }
    setBusy(true);
    const attempt = generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
      if (!mounted.current || attempt !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const el = video.current;
      if (!el) {
        stop();
        return;
      }
      el.srcObject = media;
      await el.play();
      if (attempt !== generation.current) return;
      active.current = true;
      setRunning(true);
      setBusy(false);
      setStatus("Point your camera at the QR code.");
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("CanvasUnavailable");
      const scan = () => {
        if (!active.current || !mounted.current) return;
        if (el.readyState >= 2 && el.videoWidth && el.videoHeight) {
          const scale = Math.min(
            1,
            1280 / Math.max(el.videoWidth, el.videoHeight),
          );
          canvas.width = Math.round(el.videoWidth * scale);
          canvas.height = Math.round(el.videoHeight * scale);
          context.drawImage(el, 0, 0, canvas.width, canvas.height);
          const pixels = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const code = jsQR(pixels.data, canvas.width, canvas.height, {
            inversionAttempts: "attemptBoth",
          });
          if (code && accept(code.data)) return;
        }
        timer.current = setTimeout(scan, 250);
      };
      scan();
    } catch (e) {
      if (attempt !== generation.current || !mounted.current) return;
      stop();
      const name = e instanceof Error ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings, or upload a QR image."
          : name === "NotFoundError"
            ? "No camera was found. Upload a QR image or paste your pub link."
            : name === "NotReadableError"
              ? "Your camera is busy. Close other camera apps and try again, or upload an image."
              : "Could not start the camera. Try again, upload a QR image, or paste the pub link.",
      );
    }
  }
  async function upload(imageFile?: File) {
    if (!imageFile) return;
    stop();
    setError("");
    if (!/^image\/(png|jpeg|webp|gif)$/.test(imageFile.type)) {
      setError("Choose a PNG, JPG, WebP or GIF image.");
      return;
    }
    if (imageFile.size > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB.");
      return;
    }
    setBusy(true);
    setStatus("Reading the QR image on your device…");
    const objectUrl = URL.createObjectURL(imageFile);
    const attempt = generation.current;
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      if (!mounted.current || attempt !== generation.current) return;
      if (!image.naturalWidth || !image.naturalHeight) throw new Error();
      const scale = Math.min(
        1,
        2000 / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error();
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(pixels.data, canvas.width, canvas.height, {
        inversionAttempts: "attemptBoth",
      });
      if (!code) {
        setError(
          "No readable QR code was found. Try a sharper image showing the entire code.",
        );
        setStatus("Choose another QR image.");
        return;
      }
      accept(code.data);
    } catch {
      if (mounted.current && attempt === generation.current)
        setError(
          "Could not read that image. Try another image or paste the pub link.",
        );
    } finally {
      URL.revokeObjectURL(objectUrl);
      if (mounted.current && attempt === generation.current) setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  return (
    <main className="mx-auto max-w-2xl px-5 py-8">
      <a
        href="/"
        className="inline-flex items-center gap-2 text-sm text-[#c2ff65]"
      >
        <ArrowLeft size={16} />
        Back to VibePub
      </a>
      <div className="my-8">
        <QrCode className="mb-4 text-[#c2ff65]" size={32} />
        <h1 className="text-4xl font-black tracking-tight">
          Scan. Join. Set the vibe.
        </h1>
        <p className="mt-4 text-sm leading-6 text-zinc-400">
          Scan the QR at your table or the bar. Your phone’s regular Camera app
          works too—tap the link it finds.
        </p>
      </div>
      <section
        aria-label="QR scanner"
        className="rounded-3xl border border-white/10 bg-[#19191e] p-4 sm:p-6"
      >
        <div className="relative flex aspect-square max-h-96 items-center justify-center overflow-hidden rounded-2xl bg-black">
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            aria-label="Camera QR preview"
            className={`absolute inset-0 size-full object-cover ${running ? "" : "invisible"}`}
          />
          {!running && <QrCode className="text-zinc-700" size={96} />}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute size-[65%] rounded-2xl border-2 border-[#c2ff65]/60"
          />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {running ? (
            <button
              onClick={() => {
                stop();
                setStatus("Camera stopped.");
              }}
              className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3"
            >
              <CameraOff size={18} />
              Stop camera
            </button>
          ) : (
            <button
              disabled={busy}
              onClick={() => void start()}
              className="flex items-center gap-2 rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black"
            >
              <Camera size={18} />
              {busy ? "Please wait…" : "Start camera"}
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => file.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3"
          >
            <ImageUp size={18} />
            Upload QR image
          </button>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void upload(e.target.files?.[0])}
            className="hidden"
            aria-label="Choose QR image"
          />
        </div>
        <p role="status" className="mt-4 text-sm text-zinc-400">
          {status}
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-300">
            {error}
          </p>
        )}
        <p className="mt-4 text-xs leading-5 text-zinc-500">
          Camera frames and uploaded images are decoded on your device. They are
          not uploaded or saved. The camera stops when you leave this page or
          switch away.
        </p>
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-bold">Have the link already?</h2>
        <JoinForm showScanner={false} />
      </section>
    </main>
  );
}
