"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Mentionable } from "@/lib/mentionables";

function mentionContext(value: string, caret: number) {
  const left = value.slice(0, caret);
  const match = /(?:^|\s)@([A-Za-z0-9_-]*)$/.exec(left);
  if (!match) return null;
  const query = match[1] ?? "";
  const start = caret - query.length - 1;
  return { query, start, end: caret };
}

export function MentionInput(props: {
  name: string;
  placeholder?: string;
  mentionables: Mentionable[];
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [caret, setCaret] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const input = ref.current;
    const form = input?.form;
    if (!form) return;

    const onSubmit = (event: Event) => {
      const trimmed = (ref.current?.value ?? "").trim();
      if (!trimmed) {
        event.preventDefault();
        return;
      }
      // Clear after the submit event completes so form data is captured first.
      setTimeout(() => {
        setValue("");
        setCaret(0);
        setActiveIndex(0);
      }, 0);
    };

    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  const ctx = mentionContext(value, caret);
  const suggestions = useMemo(() => {
    if (!ctx) return [];
    const q = ctx.query.toLowerCase();
    const filtered = props.mentionables.filter((m) => {
      return (
        m.handle.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
      );
    });
    return filtered.slice(0, 8);
  }, [ctx, props.mentionables]);

  const show = Boolean(ctx && suggestions.length > 0);

  function replaceMention(handle: string) {
    if (!ctx) return;
    const next = `${value.slice(0, ctx.start)}@${handle} ${value.slice(ctx.end)}`;
    setValue(next);
    setActiveIndex(0);
    requestAnimationFrame(() => {
      if (!ref.current) return;
      const pos = ctx.start + handle.length + 2;
      ref.current.focus();
      ref.current.setSelectionRange(pos, pos);
      setCaret(pos);
    });
  }

  return (
    <div className="relative w-full">
      <input
        ref={ref}
        name={props.name}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setCaret(e.target.selectionStart ?? e.target.value.length);
          setActiveIndex(0);
        }}
        onClick={(e) => setCaret(e.currentTarget.selectionStart ?? value.length)}
        onKeyUp={(e) => {
          const t = e.currentTarget;
          setCaret(t.selectionStart ?? t.value.length);
        }}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            replaceMention(suggestions[activeIndex].handle);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setActiveIndex(0);
          }
        }}
        placeholder={props.placeholder}
        className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm text-white/90 placeholder:text-white/45 outline-none focus:border-white/25"
      />

      {show ? (
        <div className="absolute bottom-[calc(100%+8px)] left-0 z-30 w-full overflow-hidden rounded-xl border border-white/15 bg-[#0c1428] shadow-lg">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={`${s.kind}:${s.handle}`}
              onMouseDown={(e) => {
                e.preventDefault();
                replaceMention(s.handle);
              }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                i === activeIndex ? "bg-white/10" : "hover:bg-white/6"
              }`}
            >
              <div className="truncate text-white/90">
                @{s.handle}
                <span className="ml-2 text-white/60">{s.label}</span>
              </div>
              <div className="ml-3 rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] uppercase text-white/70">
                {s.kind}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
