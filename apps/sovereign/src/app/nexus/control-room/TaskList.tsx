"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

interface TaskItem {
  id: string;
  status: string;
  title: string;
  createdAt: string;
}

interface TaskListProps {
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}

export function TaskList({ selectedTaskId, onSelectTask }: TaskListProps) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    const fetchTasks = async () => {
      try {
        const res = await fetch("/api/sovereign/tasks", { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Task list failed: ${res.status}`);
        }
        
        const data = await res.json();
        if (Array.isArray(data)) {
          setTasks(data);
        } else {
          console.warn("Expected task array, got:", typeof data);
        }
      } catch (e) {
        console.error("Polling error:", e);
      } finally {
        setLoading(false);
        timer = setTimeout(fetchTasks, 4000);
      }
    };

    fetchTasks();
    return () => clearTimeout(timer);
  }, []);

  if (loading && tasks.length === 0) {
    return <div className="p-4 text-xs text-white/40 italic">Initializing task feed...</div>;
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5">
         <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/40">Sovereign Tasks</h2>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => onSelectTask(task.id)}
            className={`w-full text-left p-4 border-b border-white/5 transition-all hover:bg-white/5 ${
              selectedTaskId === task.id ? "bg-white/10 ring-1 ring-inset ring-white/20" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-white/90 truncate">{task.title || "Untitled Intent"}</span>
              <StatusBadge status={task.status} />
            </div>
            <div className="mt-2 flex items-center justify-between text-[10px] text-white/40">
              <span className="font-mono">{task.id.slice(-8)}</span>
              <span>{formatDistanceToNow(new Date(task.createdAt))} ago</span>
            </div>
          </button>
        ))}
        {tasks.length === 0 && (
          <div className="p-8 text-center text-xs text-white/30 italic">No tasks found</div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    QUEUED: "text-blue-400 border-blue-400/30 bg-blue-400/10",
    RUNNING: "text-cyan-400 border-cyan-400/30 bg-cyan-400/10",
    DONE: "text-emerald-400 border-emerald-400/30 bg-emerald-200/5",
    FAILED: "text-rose-400 border-rose-400/30 bg-rose-400/10",
    MANUAL_REQUIRED: "text-amber-400 border-amber-400/30 bg-amber-400/10 animate-pulse",
    DEAD_LETTER: "text-rose-600 border-rose-600/30 bg-rose-600/5",
  };

  const color = colors[status] || "text-white/40 border-white/10 bg-white/5";

  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-bold ${color}`}>
      {status === 'MANUAL_REQUIRED' ? 'AWAITING_HUMAN' : status}
    </span>
  );
}
