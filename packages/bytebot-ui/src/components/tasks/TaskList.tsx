"use client";

import React, { useEffect, useState, useCallback } from "react";
import { TaskItem } from "@/components/tasks/TaskItem";
import { fetchTasks, bulkDeleteTasks } from "@/utils/taskUtils";
import { Task } from "@/types";
import { useWebSocket } from "@/hooks/useWebSocket";

interface TaskListProps {
  limit?: number;
  className?: string;
  title?: string;
  description?: string;
  showHeader?: boolean;
}

export const TaskList: React.FC<TaskListProps> = ({ 
  limit = 5, 
  className = "", 
  title = "Latest Tasks",
  description,
  showHeader = true,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [cleanMsg, setCleanMsg] = useState<string | null>(null);

  // WebSocket handlers for real-time updates
  const handleTaskUpdate = useCallback((updatedTask: Task) => {
    setTasks(prev => 
      prev.map(task => 
        task.id === updatedTask.id ? updatedTask : task
      )
    );
  }, []);

  const handleTaskCreated = useCallback((newTask: Task) => {
    setTasks(prev => {
      const updated = [newTask, ...prev];
      return updated.slice(0, limit);
    });
  }, [limit]);

  const handleTaskDeleted = useCallback((taskId: string) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  }, []);

  // Initialize WebSocket for task list updates
  useWebSocket({
    onTaskUpdate: handleTaskUpdate,
    onTaskCreated: handleTaskCreated,
    onTaskDeleted: handleTaskDeleted,
  });

  useEffect(() => {
    const loadTasks = async () => {
      setIsLoading(true);
      try {
        const result = await fetchTasks({ limit });
        setTasks(result.tasks);
      } catch (error) {
        console.error("Failed to load tasks:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTasks();
  }, [limit]);

  const handleCleanPending = async () => {
    setCleaning(true);
    setCleanMsg(null);
    try {
      const res = await bulkDeleteTasks({ status: 'PENDING', olderThanMinutes: 5, unqueuedOnly: true });
      if (res) {
        setCleanMsg(`Deleted ${res.count} pending task(s).`);
      } else {
        setCleanMsg('Bulk delete failed.');
      }
    } catch (e) {
      console.error(e);
      setCleanMsg('Bulk delete encountered an error.');
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className={className}>
      {showHeader && (
        <div className="mb-6 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-medium">{title}</h2>
              <p className="text-sm text-bytebot-bronze-light-11">{description}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCleanPending}
                disabled={cleaning}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${cleaning ? 'opacity-60 cursor-not-allowed' : 'hover:bg-bytebot-bronze-light-4'} border-bytebot-bronze-light-7`}
                title="Delete pending tasks older than 5 minutes that are not queued"
              >
                {cleaning ? 'Cleaning…' : 'Clear Pending > 5min Old'}
              </button>
            </div>
          </div>
          {cleanMsg && (
            <div className="text-xs text-bytebot-bronze-light-11">{cleanMsg}</div>
          )}
        </div>
      )}
      
      {isLoading ? (
        <div className="p-4 text-center">
          <div className="animate-spin h-6 w-6 border-4 border-bytebot-bronze-light-5 border-t-bytebot-bronze rounded-full mx-auto mb-2"></div>
          <p className="text-gray-500 text-sm">Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="p-4 text-center border border-dashed border-bytebot-bronze-light-5 rounded-lg">
          <p className="text-gray-500 text-sm">No tasks available</p>
          <p className="text-gray-400 text-xs mt-1">Your completed tasks will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </div>
      )}
    </div>
  );
};
