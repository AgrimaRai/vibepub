"use client";
import { useState } from "react";
import { joinToken } from "@/lib/join-token";
export function JoinForm({ showScanner = true }: { showScanner?: boolean }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const token = joinToken(value);
        if (!token) {
          setError("Paste the full pub invitation link or its join token.");
          return;
        }
        window.location.assign(`/join/${token}`);
      }}
      className="mt-5 space-y-3"
    >
      {joinToken(process.env.NEXT_PUBLIC_DEFAULT_JOIN_TOKEN || "") && (
        <div className="mb-5 rounded-xl border border-[#c2ff65]/25 bg-[#c2ff65]/5 p-4">
          <a
            href={`/join/${process.env.NEXT_PUBLIC_DEFAULT_JOIN_TOKEN}`}
            className="inline-block rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black"
          >
            Join VibePub · Pub floor
          </a>
          <p className="mt-3 text-xs leading-5 text-zinc-400">
            At a table? Scan its QR first to join that table’s trivia team.
          </p>
        </div>
      )}
      <label className="block text-sm text-zinc-300">
        Pub invitation link or token
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the link shared by your pub"
          className="mt-2"
          required
        />
      </label>
      <button className="rounded-xl bg-[#c2ff65] px-5 py-3 font-bold text-black">
        Join the pub
      </button>
      {showScanner && (
        <a
          href="/scan"
          className="ml-3 inline-block rounded-xl border border-white/20 px-5 py-3 text-sm"
        >
          Scan a QR code
        </a>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
    </form>
  );
}
