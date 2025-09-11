"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Task } from "@/types";
import { fetchScheduledTasks, deleteTask } from "@/utils/taskUtils";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

interface ScheduledTaskListProps {
  className?: string;
  enabled?: boolean; // control polling
}

export const ScheduledTaskList: React.FC<ScheduledTaskListProps> = ({ className = "", enabled = true }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchScheduledTasks();
      setTasks(result);
    } catch {
      setError("Failed to load scheduled tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load, enabled]);

  const handleDelete = async (taskId: string) => {
    const ok = await deleteTask(taskId);
    if (ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    }
  };

  const formatDateTime = (iso?: string) => {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return format(d, "MMM d, yyyy h:mmaaa");
    } catch {
      return iso;
    }
  };

  return (
    <div className={className}>
      <div className="mb-3">
        <h3 className="text-sm font-medium">Scheduled Tasks</h3>
        <p className="text-xs text-bytebot-bronze-light-11">Tasks scheduled for the future (not yet queued)</p>
      </div>
      {loading ? (
        <div className="p-4 text-center">
          <div className="animate-spin h-5 w-5 border-2 border-bytebot-bronze-light-5 border-t-bytebot-bronze rounded-full mx-auto mb-2"></div>
          <p className="text-gray-500 text-sm">Loading scheduled tasks...</p>
        </div>
      ) : error ? (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
      ) : tasks.length === 0 ? (
        <div className="p-4 text-center border border-dashed border-bytebot-bronze-light-5 rounded-lg">
          <p className="text-gray-500 text-sm">No scheduled tasks</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-md border border-bytebot-bronze-light-7 bg-bytebot-bronze-light-2 p-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{t.description}</span>
                <span className="text-xs text-bytebot-bronze-light-10">Scheduled for {formatDateTime(t.scheduledFor)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(t.id)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
