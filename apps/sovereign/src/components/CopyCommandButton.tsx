"use client";

import { useState } from "react";

export function CopyCommandButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute right-2 top-2 rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-xs font-medium text-white/90 hover:bg-white/15"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
