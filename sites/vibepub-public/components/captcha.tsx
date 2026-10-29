"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef } from "react";
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}
export const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const id = useRef<string | undefined>(undefined);
  const render = useCallback(() => {
    if (!el.current || !window.turnstile || id.current) return;
    id.current = window.turnstile.render(el.current, {
      sitekey: captchaSiteKey,
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
      theme: "dark",
    });
  }, [onToken]);
  useEffect(() => {
    render();
    return () => {
      if (id.current) {
        window.turnstile?.remove(id.current);
        id.current = undefined;
      }
    };
  }, [render]);
  if (!captchaSiteKey) return null;
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={render}
      />
      <div ref={el} className="my-4" />
    </>
  );
}
