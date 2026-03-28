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
      className="ds-btn-secondary ds-btn-compact absolute right-2 top-2 font-medium"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
