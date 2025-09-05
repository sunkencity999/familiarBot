export type FileEntry = {
  name: string;
  type: 'file' | 'dir';
  size: number;
  mtime: number;
};

async function ensureOk(res: Response, fallback: string) {
  if (res.ok) return;
  let msg = fallback;
  try {
    const text = await res.text();
    msg = text || fallback;
  } catch {}
  throw new Error(msg);
}

export async function listDir(path?: string): Promise<{ path: string; entries: FileEntry[] }> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`/api/files/list${qs}`);
  await ensureOk(res, 'Failed to list directory');
  return res.json();
}

export async function downloadFile(path: string): Promise<{ data: string; name?: string; mediaType?: string; size?: number }> {
  const res = await fetch(`/api/files/download?path=${encodeURIComponent(path)}`);
  await ensureOk(res, 'Failed to download file');
  return res.json();
}

export async function uploadFile(targetPath: string, file: File) {
  const base64 = await fileToBase64(file);
  const res = await fetch(`/api/files/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: targetPath, data: base64 }),
  });
  await ensureOk(res, 'Failed to upload file');
  return res.json();
}

export async function mkdir(path: string) {
  const res = await fetch(`/api/files/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  await ensureOk(res, 'Failed to create directory');
  return res.json();
}

export async function deletePath(path: string) {
  const res = await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
  await ensureOk(res, 'Failed to delete');
  return res.json();
}

export async function movePath(from: string, to: string) {
  const res = await fetch(`/api/files/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to }),
  });
  await ensureOk(res, 'Failed to move');
  return res.json();
}

export async function getClipboard(): Promise<{ text: string }> {
  const res = await fetch(`/api/clipboard`);
  await ensureOk(res, 'Failed to read clipboard');
  return res.json();
}

export async function setClipboard(text: string) {
  const res = await fetch(`/api/clipboard`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  await ensureOk(res, 'Failed to set clipboard');
  return res.json();
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
