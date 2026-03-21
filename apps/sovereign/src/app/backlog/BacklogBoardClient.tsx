"use client";

import { useCallback, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
  BACKLOG: "Backlog",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled"
};

type Item = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: number;
  acceptanceCriteria: string[] | null;
  goalId: string | null;
  goalTitle: string | null;
  threadRef: string | null;
  createdAt: string;
};

type Goal = { id: string; title: string };

type ItemDetail = Item & {
  feedback?: Array<{ kind: string; reason: string | null; createdAt: string }>;
};

export function BacklogBoardClient(props: {
  boardId: string;
  boardName: string;
  columns: readonly string[];
  items: Item[];
  goals: Goal[];
}) {
  const [goalFilter, setGoalFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const itemsByStatus = useCallback(() => {
    const filtered = goalFilter
      ? props.items.filter((i) => i.goalId === goalFilter)
      : props.items;
    const map: Record<string, Item[]> = {};
    for (const col of props.columns) map[col] = [];
    for (const it of filtered) {
      if (map[it.status]) map[it.status].push(it);
    }
    return map;
  }, [props.items, props.columns, goalFilter])();

  const openDetail = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/backlog/items/${id}`);
      if (res.ok) {
        const data = await res.json();
        setDetail({
          ...data,
          acceptanceCriteria: data.acceptanceCriteria ?? null,
          feedback: data.feedback?.map((f: { kind: string; reason: string | null; createdAt: string }) => ({
            kind: f.kind,
            reason: f.reason,
            createdAt: f.createdAt
          }))
        });
      }
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-white/70">Goal filter</label>
        <select
          className="rounded border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white focus:border-white/40 focus:outline-none"
          value={goalFilter}
          onChange={(e) => setGoalFilter(e.target.value)}
        >
          <option value="">All</option>
          {props.goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {props.columns.map((status) => (
          <div
            key={status}
            className="min-w-[260px] flex-shrink-0 rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div className="mb-2 text-sm font-medium text-white/90">
              {STATUS_LABELS[status] ?? status}
            </div>
            <div className="space-y-2">
              {itemsByStatus[status]?.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  className="w-full rounded border border-white/10 bg-black/20 p-3 text-left text-sm transition hover:border-white/20 hover:bg-white/5"
                  onClick={() => openDetail(it.id)}
                >
                  <div className="font-medium text-white">{it.title}</div>
                  {it.goalTitle ? (
                    <div className="mt-1 text-xs text-white/60">{it.goalTitle}</div>
                  ) : null}
                </button>
              ))}
              {(!itemsByStatus[status] || itemsByStatus[status].length === 0) && (
                <div className="py-6 text-center text-sm text-white/40">No items</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedId && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Item detail"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-white/15 bg-zinc-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-semibold text-white">Item detail</h3>
              <button
                type="button"
                className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white"
                onClick={() => { setSelectedId(null); setDetail(null); }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            {loadingDetail && (
              <div className="mt-4 text-sm text-white/60">Loading…</div>
            )}
            {!loadingDetail && detail && (
              <div className="mt-4 space-y-4 text-sm">
                <div>
                  <div className="text-white/60">Title</div>
                  <div className="mt-1 text-white">{detail.title}</div>
                </div>
                {detail.description && (
                  <div>
                    <div className="text-white/60">Description</div>
                    <div className="mt-1 text-white whitespace-pre-wrap">{detail.description}</div>
                  </div>
                )}
                <div>
                  <div className="text-white/60">Status</div>
                  <div className="mt-1 text-white">{STATUS_LABELS[detail.status] ?? detail.status}</div>
                </div>
                {Array.isArray(detail.acceptanceCriteria) && detail.acceptanceCriteria.length > 0 && (
                  <div>
                    <div className="text-white/60">Acceptance criteria</div>
                    <ul className="mt-1 list-inside list-disc text-white">
                      {detail.acceptanceCriteria.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {detail.feedback && detail.feedback.length > 0 && (
                  <div>
                    <div className="text-white/60">PO feedback</div>
                    <ul className="mt-1 space-y-1 text-white">
                      {detail.feedback.map((f, i) => (
                        <li key={i} className="rounded bg-white/5 px-2 py-1">
                          <span className="font-medium">{f.kind}</span>
                          {f.reason ? ` — ${f.reason}` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
