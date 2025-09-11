import { Message, Task, Model, GroupedMessages, FileWithBase64, TaskStatus } from "@/types";

/**
 * Base configuration for API requests
 */
const API_CONFIG = {
  baseUrl: "/api",
  headers: {
    "Content-Type": "application/json",
  },
  credentials: "include" as RequestCredentials,
};

/**
 * Generic API request handler
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T | null> {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        ...API_CONFIG.headers,
        ...options.headers,
      },
      credentials: API_CONFIG.credentials,
    });

    if (!response.ok) {
      throw new Error(
        `API request failed: ${response.status} ${response.statusText}`,
      );
    }
    return await response.json();
  } catch (error) {
    console.error(`Error in API request to ${endpoint}:`, error);
    return null;
  }
}

/**
 * Build query string from parameters
 */
function buildQueryString(
  params: Record<string, string | number | boolean>,
): string {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.append(key, value.toString());
    }
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Fetches messages for a specific task
 */
export async function fetchTaskMessages(
  taskId: string,
  options?: {
    limit?: number;
    page?: number;
  },
): Promise<Message[]> {
  const queryString = options ? buildQueryString(options) : "";
  const result = await apiRequest<Message[]>(
    `/tasks/${taskId}/messages${queryString}`,
    { method: "GET" },
  );
  return result || [];
}

/**
 * Fetches raw messages for a specific task (unprocessed)
 */
export async function fetchTaskRawMessages(
  taskId: string,
  options?: {
    limit?: number;
    page?: number;
  },
): Promise<Message[]> {
  const queryString = options ? buildQueryString(options) : "";
  const result = await apiRequest<Message[]>(
    `/tasks/${taskId}/messages/raw${queryString}`,
    { method: "GET" },
  );
  return result || [];
}

/**
 * Fetches processed and grouped messages for a specific task (for chat UI)
 */
export async function fetchTaskProcessedMessages(
  taskId: string,
  options?: {
    limit?: number;
    page?: number;
  },
): Promise<GroupedMessages[]> {
  const queryString = options ? buildQueryString(options) : "";
  const result = await apiRequest<GroupedMessages[]>(
    `/tasks/${taskId}/messages/processed${queryString}`,
    { method: "GET" },
  );
  return result || [];
}

/**
 * Fetches a specific task by ID
 */
export async function fetchTaskById(taskId: string): Promise<Task | null> {
  return apiRequest<Task>(`/tasks/${taskId}`, { method: "GET" });
}

/**
 * Sends a message to start a new task
 */
export async function startTask(data: {
  description: string;
  model: Model;
  files?: FileWithBase64[];
  scheduledFor?: string; // ISO string; backend will parse to Date
}): Promise<Task | null> {
  return apiRequest<Task>("/tasks", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Guides an existing task with a message
 */
export async function addMessage(
  taskId: string,
  message: string,
): Promise<Task | null> {
  return apiRequest<Task>(`/tasks/${taskId}/messages`, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
}

/**
 * Fetches all tasks with optional pagination and filtering
 */
export async function fetchTasks(options?: {
  page?: number;
  limit?: number;
  status?: string;
  statuses?: string[];
}): Promise<{ tasks: Task[]; total: number; totalPages: number }> {
  const params: Record<string, string | number> = {};
  
  if (options?.page) params.page = options.page;
  if (options?.limit) params.limit = options.limit;
  if (options?.status) params.status = options.status;
  if (options?.statuses && options.statuses.length > 0) {
    params.statuses = options.statuses.join(',');
  }
  
  const queryString = Object.keys(params).length > 0 ? buildQueryString(params) : "";
  const result = await apiRequest<{ tasks: Task[]; total: number; totalPages: number }>(
    `/tasks${queryString}`,
    { method: "GET" }
  );
  return result || { tasks: [], total: 0, totalPages: 0 };
}

/**
 * Fetches task counts for grouped tabs
 */
export async function fetchTaskCounts(): Promise<Record<string, number>> {
  try {
    const allTasksResult = await fetchTasks();
    
    // Define the status groups
    const statusGroups = {
      ALL: Object.values(TaskStatus),
      ACTIVE: [TaskStatus.PENDING, TaskStatus.RUNNING, TaskStatus.NEEDS_HELP, TaskStatus.NEEDS_REVIEW],
      COMPLETED: [TaskStatus.COMPLETED],
      CANCELLED_FAILED: [TaskStatus.CANCELLED, TaskStatus.FAILED],
    };

    const counts: Record<string, number> = {
      ALL: allTasksResult.total,
      ACTIVE: 0,
      COMPLETED: 0,
      CANCELLED_FAILED: 0,
    };

    // Fetch counts for each group
    const groupPromises = Object.entries(statusGroups).map(async ([groupKey, statuses]) => {
      if (groupKey === 'ALL') {
        return { groupKey, count: allTasksResult.total };
      }
      
      const result = await fetchTasks({ statuses, limit: 1 });
      return { groupKey, count: result.total };
    });

    const groupCounts = await Promise.all(groupPromises);
    groupCounts.forEach(({ groupKey, count }) => {
      counts[groupKey] = count;
    });

    return counts;
  } catch (error) {
    console.error("Failed to fetch task counts:", error);
    return {
      ALL: 0,
      ACTIVE: 0,
      COMPLETED: 0,
      CANCELLED_FAILED: 0,
    };
  }
}

export async function fetchModels(): Promise<Model[]> {
  try {
    const response = await fetch("/api/tasks/models", {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    });
    if (!response.ok) {
      throw new Error("Failed to fetch models");
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching models:", error);
    return [];
  }
}

/**
 * Takes over control of a task
 */
export async function takeOverTask(taskId: string): Promise<Task | null> {
  return apiRequest<Task>(`/tasks/${taskId}/takeover`, { method: "POST" });
}

/**
 * Resumes a paused or stopped task
 */
export async function resumeTask(taskId: string): Promise<Task | null> {
  return apiRequest<Task>(`/tasks/${taskId}/resume`, { method: "POST" });
}

export async function forceResumeTask(taskId: string): Promise<Task | null> {
  return apiRequest<Task>(`/tasks/${taskId}/force-resume`, { method: "POST" });
}

/**
 * Cancels a running task
 */
export async function cancelTask(taskId: string): Promise<Task | null> {
  return apiRequest<Task>(`/tasks/${taskId}/cancel`, { method: "POST" });
}

/**
 * Fetch upcoming scheduled tasks (not yet queued)
 */
export async function fetchScheduledTasks(): Promise<Task[]> {
  const result = await apiRequest<Task[]>(`/tasks/scheduled`, { method: "GET" });
  return result || [];
}

/**
 * Delete a task by id
 */
export async function deleteTask(taskId: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/tasks/${taskId}`, {
      method: "DELETE",
      headers: API_CONFIG.headers,
      credentials: API_CONFIG.credentials,
    });
    return response.ok;
  } catch (e) {
    console.error("Failed to delete task", e);
    return false;
  }
}

/**
 * Bulk delete tasks by status, with optional age and queued filters
 */
export async function bulkDeleteTasks(params: {
  status: string;
  olderThanMinutes?: number;
  unqueuedOnly?: boolean;
}): Promise<{ count: number; ids: string[] } | null> {
  const query = buildQueryString({
    status: params.status,
    ...(params.olderThanMinutes !== undefined
      ? { olderThanMinutes: params.olderThanMinutes }
      : {}),
    ...(params.unqueuedOnly !== undefined
      ? { unqueuedOnly: params.unqueuedOnly }
      : {}),
  });
  try {
    const res = await fetch(`${API_CONFIG.baseUrl}/tasks${query}`, {
      method: "DELETE",
      headers: API_CONFIG.headers,
      credentials: API_CONFIG.credentials,
    });
    if (!res.ok) {
      throw new Error(`Bulk delete failed: ${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (e) {
    console.error("Failed to bulk delete tasks", e);
    return null;
  }
}

// ==========================
// Recurring task API helpers
// ==========================

export interface CreateRecurringPayload {
  description: string;
  cron: string;
  timezone: string; // IANA timezone
  priority?: TaskStatus | string; // will be normalized on server
  model: Model;
}

export interface RecurringItem {
  id: string;
  description: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRunAt: string;
  lastRunAt?: string;
  priority: string;
  createdBy: string;
  model: Model;
}

export async function createRecurring(data: CreateRecurringPayload): Promise<RecurringItem | null> {
  return apiRequest<RecurringItem>(`/recurring`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function listRecurring(active?: boolean): Promise<RecurringItem[]> {
  const q = typeof active === 'boolean' ? `?active=${active}` : '';
  const res = await apiRequest<RecurringItem[]>(`/recurring${q}`, { method: 'GET' });
  return res || [];
}

export async function pauseRecurring(id: string): Promise<RecurringItem | null> {
  return apiRequest<RecurringItem>(`/recurring/${id}/pause`, { method: 'POST' });
}

export async function resumeRecurring(id: string): Promise<RecurringItem | null> {
  return apiRequest<RecurringItem>(`/recurring/${id}/resume`, { method: 'POST' });
}

export async function deleteRecurring(id: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_CONFIG.baseUrl}/recurring/${id}`, {
      method: "DELETE",
      headers: API_CONFIG.headers,
      credentials: API_CONFIG.credentials,
    });
    return response.ok;
  } catch (e) {
    console.error('Failed to delete recurring', e);
    return false;
  }
}

export async function updateRecurring(id: string, data: Partial<CreateRecurringPayload> & { active?: boolean }): Promise<RecurringItem | null> {
  return apiRequest<RecurringItem>(`/recurring/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
