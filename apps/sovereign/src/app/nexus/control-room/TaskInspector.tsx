"use client";

import { useEffect, useState } from "react";
import { SovereignStatePayload } from "@/lib/sovereign-dag";
import { formatDistanceToNow } from "date-fns";

interface TaskInspectorProps {
  taskId: string | null;
}

export function TaskInspector({ taskId }: TaskInspectorProps) {
  const [task, setTask] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!taskId) return;
    
    let timer: NodeJS.Timeout;

    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/sovereign/status?taskId=${taskId}`, { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Status fetch failed: ${res.status}`);
        }
        const data = await res.json();
        setTask(data);
      } catch (e) {
        console.error("Fetch detail error:", e);
      } finally {
        setLoading(false);
        // Only set the timer if we are still on this taskId
        timer = setTimeout(() => {
            if (task?.status === 'RUNNING' || task?.status === 'QUEUED' || task?.status === 'MANUAL_REQUIRED' || !task) {
                fetchDetail();
            }
        }, 5000);
      }
    };

    setLoading(true);
    fetchDetail();

    return () => clearTimeout(timer);
  }, [taskId]);

  const handleApprove = async () => {
    if (!task?.payload?.execution_state?.callback_token) return;
    setApproving(true);
    try {
      const res = await fetch("/api/sovereign/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            taskId, 
            token: task.payload.execution_state.callback_token 
        }),
      });
      if (res.ok) {
        // Refresh immediately after approval
        const detailRes = await fetch(`/api/sovereign/status?taskId=${taskId}`);
        if (detailRes.ok) setTask(await detailRes.json());
      }
    } catch (e) {
      console.error("Approval error:", e);
    } finally {
      setApproving(false);
    }
  };

  if (!taskId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-white/20 p-8 space-y-4">
        <div className="w-16 h-16 rounded-full border border-dashed border-white/10 flex items-center justify-center">
            <svg className="w-8 h-8 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
        </div>
        <p className="text-xs uppercase tracking-widest font-mono">Select a task to inspect DAG state</p>
      </div>
    );
  }

  if (loading && !task) {
    return <div className="p-8 text-white/40 italic text-xs">Fetching telemetery...</div>;
  }

  const payload = task?.payload as SovereignStatePayload;

  return (
    <div className="h-full flex flex-col overflow-hidden custom-scrollbar">
      {/* Header */}
      <div className="p-6 border-b border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-white/90">{task?.title || "Sovereign Intent"}</h1>
            <div className="flex items-center gap-3 text-[10px] text-white/40 font-mono">
              <span>{task?.id}</span>
              <span>•</span>
              <span>{task?.createdAt ? formatDistanceToNow(new Date(task.createdAt)) : "Unknown time"} ago</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
             <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase ${
                task?.status === 'MANUAL_REQUIRED' ? 'text-amber-400 border-amber-400/30 bg-amber-400/10' : 
                task?.status === 'DONE' ? 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5' :
                'text-white/60 border-white/10 bg-white/5'
             }`}>
                {task?.status === 'MANUAL_REQUIRED' ? 'AWAITING HUMAN APPROVAL' : task?.status}
             </span>
             <span className="text-[10px] text-white/30 uppercase tracking-tighter">
                Risk Tier: <span className="font-bold text-white/60">{payload?.task_profile?.risk_tier || "N/A"}</span>
             </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {/* Intention Section */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/30">Raw Intent</h3>
          <div className="ds-panel-deep p-4 text-sm text-white/80 leading-relaxed italic">
            "{payload?.task_profile?.intent_raw}"
          </div>
        </section>

        {/* Governance Cage Section */}
        {task?.status === 'MANUAL_REQUIRED' && (
          <section className="p-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 space-y-4 ring-1 ring-amber-400/20">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-400/10 flex items-center justify-center">
                   <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.876c.618 0 1.056-.666.757-1.166L13.137 3.01c-.301-.498-1.057-.498-1.358 0L3.062 16.834c-.3.5-.66.834-.66 1.334z" />
                   </svg>
                </div>
                <div>
                   <h3 className="text-sm font-bold text-amber-50">Governance Boundary Hit</h3>
                   <p className="text-[10px] text-amber-200/60 uppercase">Manual resolution required for execution</p>
                </div>
            </div>
            
            <div className="ds-panel-deep bg-black/40 p-4 border-amber-400/10">
               <h4 className="text-[10px] font-bold text-amber-200/50 uppercase mb-2">Proposed Artifact</h4>
               <div className="text-xs text-amber-50/90 whitespace-pre-wrap font-serif leading-relaxed">
                  {payload?.draft_payload?.content || "(No draft generated yet)"}
               </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button 
                onClick={handleApprove}
                disabled={approving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-xs font-bold transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-50"
              >
                {approving ? "AUTHORIZING..." : "APPROVE EXECUTION"}
              </button>
              <button 
                className="px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-400/10 text-red-100 text-xs font-bold transition-all hover:bg-red-400/20 active:scale-95"
              >
                REJECT & FAIL
              </button>
            </div>
          </section>
        )}

        {/* Score Vector Stats */}
        <section className="space-y-4">
           <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/30">Mathematical Trust Matrix</h3>
           <div className="grid grid-cols-4 gap-3">
             {[
               { label: "Grounding", value: payload?.score_vector?.grounding, color: "text-blue-400" },
               { label: "Completeness", value: payload?.score_vector?.completeness, color: "text-cyan-400" },
               { label: "Policy", value: payload?.score_vector?.policy, color: "text-emerald-400" },
               { label: "Weighted Sum", value: payload?.score_vector?.weighted_sum, color: "text-white font-bold" }
             ].map((score) => (
               <div key={score.label} className="ds-panel-deep p-4 text-center space-y-1">
                 <div className="text-[8px] uppercase tracking-tighter text-white/30 truncate">{score.label}</div>
                 <div className={`text-sm font-mono ${score.color}`}>
                    {score.value !== undefined ? score.value.toFixed(2) : "0.00"}
                 </div>
               </div>
             ))}
           </div>
        </section>

        {/* Audit Trail */}
        <section className="space-y-4">
           <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/30">Node Execution Lifecycle</h3>
           <div className="space-y-2">
              {Object.entries(payload?.node_results || {}).map(([node, result]: [string, any]) => (
                <div key={node} className="ds-panel-deep p-4 flex items-center justify-between border-white/5 hover:border-white/10 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-1.5 rounded-full ${result.ok === false ? 'bg-red-400' : 'bg-emerald-400'}`} />
                    <span className="text-xs font-mono uppercase tracking-widest text-white/80">{node.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px]">
                    {result.risk_tier && <span className="text-white/30">Tier: <span className="text-white/60">{result.risk_tier}</span></span>}
                    {result.retry_count > 0 && <span className="text-amber-400/60">Retries: {result.retry_count}</span>}
                    <span className="text-white/20">{result.node_time_ms ? `${(result.node_time_ms / 1000).toFixed(1)}s` : "n/a"}</span>
                  </div>
                </div>
              ))}
              {Object.keys(payload?.node_results || {}).length === 0 && (
                <div className="p-8 text-center border border-dashed border-white/5 rounded-2xl text-white/20 italic text-[10px]">
                    Propagating through DAG engine...
                </div>
              )}
           </div>
        </section>

        {/* Final Artifact (if done) */}
        {task?.status === 'DONE' && (
           <section className="space-y-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-white/30">Distributed Artifact</h3>
              <div className="ds-panel-deep bg-white/5 p-6 border-emerald-400/10">
                <div className="prose prose-sm prose-invert max-w-none text-xs leading-relaxed font-serif text-white/80 whitespace-pre-wrap">
                    {payload?.draft_payload?.content}
                </div>
              </div>
           </section>
        )}
      </div>
    </div>
  );
}
