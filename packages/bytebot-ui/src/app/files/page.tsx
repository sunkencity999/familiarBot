"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { listDir, downloadFile, uploadFile, mkdir, deletePath, getClipboard, setClipboard, FileEntry } from "@/utils/filesApi";

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"]; let i = -1; let s = n;
  do { s /= 1024; i++; } while (s >= 1024 && i < units.length-1);
  return `${s.toFixed(1)} ${units[i]}`;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return 'Unknown error';
  }
}

export default function FilesPage() {
  const [cwd, setCwd] = useState<string>("");
  const [basePath, setBasePath] = useState<string>("");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [clipboard, setClipboardState] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState<string>("");

  const refresh = useCallback(async (path?: string) => {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      console.log('Fetching directory:', path || 'root');
      const res = await listDir(path);
      console.log('API response:', res);
      setCwd(res.path);
      if (!basePath) setBasePath(res.path); // capture base on first load
      setEntries(
        res.entries.sort((a, b) =>
          a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1,
        ),
      );
      console.log('Entries set:', res.entries.length, 'items');
    } catch (e: unknown) {
      console.error('List error', e);
      setError(getErrorMessage(e) || 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => { 
    console.log('Initial load effect triggered');
    refresh(""); 
  }, []);

  const join = (a: string, b: string) => `${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`;

  const goUp = async () => {
    if (!cwd) return refresh("");
    const current = cwd.replace(/\/$/, '');
    if (basePath && (current === basePath || current.startsWith(basePath) && current.length <= basePath.length)) {
      return refresh(basePath);
    }
    const idx = current.lastIndexOf('/');
    if (idx <= 0) return refresh(basePath || '');
    const up = current.slice(0, idx);
    // prevent navigating above basePath
    if (basePath && !up.startsWith(basePath)) return refresh(basePath);
    await refresh(up);
  };

  const onDrop: React.DragEventHandler<HTMLDivElement> = async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    try {
      for (const f of files) {
        const target = `${cwd}/${f.name}`;
        await uploadFile(target, f);
      }
      await refresh();
    } catch (e: unknown) {
      console.error('Upload error', e);
      setError(getErrorMessage(e) || 'Upload failed');
    }
  };

  const onDownload = async (name: string) => {
    const path = `${cwd}/${name}`;
    try {
      const res = await downloadFile(path);
      const blob = b64toBlob(res.data, res.mediaType || 'application/octet-stream');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: unknown) {
      console.error('Download error', e);
      setError(getErrorMessage(e) || 'Download failed');
    }
  };

  const b64toBlob = (b64Data: string, contentType: string) => {
    const byteCharacters = atob(b64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: contentType });
  };

  const handleCreateFolder = async () => {
    if (!newFolder.trim()) return;
    try {
      await mkdir(`${cwd}/${newFolder.trim()}`);
      setNewFolder("");
      await refresh();
    } catch (e: unknown) {
      console.error('Mkdir error', e);
      setError(getErrorMessage(e) || 'Failed to create folder');
    }
  };

  const handleDelete = async (name: string) => {
    try {
      await deletePath(`${cwd}/${name}`);
      await refresh();
    } catch (e: unknown) {
      console.error('Delete error', e);
      setError(getErrorMessage(e) || 'Delete failed');
    }
  };

  const pullClipboard = async () => {
    try {
      const res = await getClipboard();
      setClipboardState(res.text || "");
      setNotice('Clipboard pulled from desktop');
    } catch (e: unknown) {
      console.error('Clipboard read error', e);
      setError(getErrorMessage(e) || 'Failed to read clipboard');
    }
  };

  const pushClipboard = async () => {
    try {
      await setClipboard(clipboard);
      setNotice('Clipboard pushed to desktop');
    } catch (e: unknown) {
      console.error('Clipboard set error', e);
      setError(getErrorMessage(e) || 'Failed to set clipboard');
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden px-6 pt-6 pb-10">
        <div className="mx-auto max-w-5xl grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
            <div className="mb-3 flex items-center gap-2">
              <button className="rounded border px-2 py-1" onClick={goUp}>Up</button>
              <div className="text-sm text-gray-500 truncate" title={cwd}>{cwd || '/home/user'}</div>
              <button className="ml-auto rounded border px-2 py-1" onClick={() => refresh()}>Refresh</button>
            </div>
            {(error || notice) && (
              <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-red-700 text-sm">
                {error || notice}
              </div>
            )}
            <div
              className="border rounded-md h-[60vh] overflow-auto p-2"
              onDragOver={(e)=>{e.preventDefault();}}
              onDrop={onDrop}
            >
              {loading ? (
                <div className="p-4 text-gray-500">Loading…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-1">Name</th>
                      <th className="py-1 w-24">Size</th>
                      <th className="py-1 w-40">Modified</th>
                      <th className="py-1 w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e)=> (
                      <tr key={e.name} className="border-t">
                        <td className="py-1">
                          {e.type==='dir' ? (
                            <button className="text-blue-600 hover:underline" onClick={()=>refresh(join(cwd || basePath, e.name))}>{e.name}/</button>
                          ) : (
                            <span>{e.name}</span>
                          )}
                        </td>
                        <td className="py-1">{e.type==='dir'?'-':humanSize(e.size)}</td>
                        <td className="py-1">{new Date(e.mtime).toLocaleString()}</td>
                        <td className="py-1 text-right">
                          {e.type==='file' && (
                            <button className="rounded border px-2 py-0.5 mr-2" onClick={()=>onDownload(e.name)}>Download</button>
                          )}
                          <button className="rounded border px-2 py-0.5" onClick={()=>handleDelete(e.name)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <input className="border rounded px-2 py-1 flex-1" placeholder="New folder name" value={newFolder} onChange={(e)=>setNewFolder(e.target.value)} />
              <button className="rounded border px-3" onClick={handleCreateFolder}>Create</button>
            </div>
            <div className="mt-2 text-xs text-gray-500">Drag files into the panel to upload to this directory.</div>
          </div>
          <div>
            <div className="border rounded-md p-3">
              <div className="font-medium mb-2">Clipboard Sync</div>
              <textarea className="w-full border rounded p-2 h-40" value={clipboard} onChange={(e)=>setClipboardState(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button className="rounded border px-2 py-1" onClick={pullClipboard}>Pull from Desktop</button>
                <button className="rounded border px-2 py-1" onClick={pushClipboard}>Push to Desktop</button>
              </div>
              <div className="mt-2 text-xs text-gray-500">Current desktop clipboard text can be pulled/updated here.</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
