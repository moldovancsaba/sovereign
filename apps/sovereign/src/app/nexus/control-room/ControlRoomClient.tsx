"use client";

import { useState } from "react";
import { TaskList } from "./TaskList";
import { TaskInspector } from "./TaskInspector";

export function ControlRoomClient() {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[600px] border border-white/10 rounded-3xl overflow-hidden bg-black/40 backdrop-blur-xl shadow-2xl">
      {/* Sidebar */}
      <div className="w-80 border-r border-white/10 bg-black/20">
        <TaskList 
          selectedTaskId={selectedTaskId} 
          onSelectTask={setSelectedTaskId} 
        />
      </div>

      {/* Main Inspector */}
      <div className="flex-1 bg-gradient-to-br from-black/10 via-white/5 to-black/20 overflow-hidden">
        <TaskInspector taskId={selectedTaskId} />
      </div>
    </div>
  );
}
