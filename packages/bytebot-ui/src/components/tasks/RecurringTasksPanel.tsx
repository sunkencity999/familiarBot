"use client";

import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Model } from "@/types";
import { fetchModels } from "@/utils/taskUtils";
import {
  createRecurring,
  deleteRecurring,
  listRecurring,
  pauseRecurring,
  resumeRecurring,
  RecurringItem,
  CreateRecurringPayload,
} from "@/utils/taskUtils";
import { format } from "date-fns";

const COMMON_TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
];

export const RecurringTasksPanel: React.FC = () => {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string>("");

  // Form state
  const [description, setDescription] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5"); // default weekdays 9am
  const [timezone, setTimezone] = useState<string>("America/Los_Angeles");

  useEffect(() => {
    fetchModels()
      .then((m) => {
        setModels(m);
        if (m.length > 0) setSelectedModel(m[0]);
      })
      .catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const data = await listRecurring();
      setItems(data);
    } catch {
      setError("Failed to load recurring tasks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const handleCreate = async () => {
    if (!description.trim() || !selectedModel) return;
    setCreating(true);
    setError("");
    const payload: CreateRecurringPayload = {
      description: description.trim(),
      cron: cron.trim(),
      timezone,
      model: selectedModel,
    };
    try {
      const created = await createRecurring(payload);
      if (created) {
        setDescription("");
        await load();
      }
    } catch {
      setError("Failed to create recurring task. Check cron/timezone.");
    } finally {
      setCreating(false);
    }
  };

  const formatDT = (s?: string) => {
    if (!s) return "-";
    try { return format(new Date(s), "MMM d, yyyy h:mmaaa"); } catch { return s; }
  };

  return (
    <div className="bg-bytebot-bronze-light-2 border-bytebot-bronze-light-7 w-full rounded-2xl border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-medium">Recurring Tasks</h3>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>Refresh</Button>
      </div>

      {error && (
        <div className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
      )}

      {/* Create form */}
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-bytebot-bronze-light-10">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border-bytebot-bronze-light-7 rounded-md border bg-transparent p-2 text-sm"
            placeholder="e.g., Check calendar and summarize"
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-bytebot-bronze-light-10">Cron</label>
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="border-bytebot-bronze-light-7 rounded-md border bg-transparent p-2 text-sm"
            placeholder="* * * * *"
          />
        </div>
        <div className="flex flex-col">
          <label className="mb-1 text-xs text-bytebot-bronze-light-10">Timezone</label>
          <Select value={timezone} onValueChange={setTimezone}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Timezone" />
            </SelectTrigger>
            <SelectContent>
              {COMMON_TIMEZONES.map((tz) => (
                <SelectItem key={tz} value={tz}>{tz}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col md:col-span-2">
          <label className="mb-1 text-xs text-bytebot-bronze-light-10">Model</label>
          <Select value={selectedModel?.name ?? ""} onValueChange={(val) => setSelectedModel(models.find((m) => m.name === val) || null)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.name} value={m.name}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button onClick={handleCreate} disabled={creating || !description.trim() || !selectedModel}>
            {creating ? "Creating..." : "Create Recurring"}
          </Button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="p-3 text-center text-sm text-bytebot-bronze-light-10">Loading...</div>
      ) : items.length === 0 ? (
        <div className="p-3 text-center text-sm text-bytebot-bronze-light-10">No recurring tasks</div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-center justify-between rounded-md border border-bytebot-bronze-light-7 bg-bytebot-bronze-light-1 p-3">
              <div className="flex min-w-0 flex-col">
                <div className="truncate text-sm font-medium">{it.description}</div>
                <div className="text-xs text-bytebot-bronze-light-10">{it.cron} • {it.timezone} • Next: {formatDT(it.nextRunAt)} • Last: {formatDT(it.lastRunAt)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {it.active ? (
                  <Button variant="ghost" size="sm" onClick={async () => { await pauseRecurring(it.id); await load(); }}>Pause</Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={async () => { await resumeRecurring(it.id); await load(); }}>Resume</Button>
                )}
                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={async () => { await deleteRecurring(it.id); await load(); }}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
