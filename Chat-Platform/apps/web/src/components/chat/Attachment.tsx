import { useEffect, useState } from 'react';
import { Download, FileText, Loader2, X } from 'lucide-react';
import type { FileDTO } from '@repo/shared-types';
import { Api } from '../../lib/api';
import { downloadFile } from '../../lib/files';

// Module 10 — preview images inline, download anything. Files require the bearer token, so we
// fetch them as blobs (an <img src> can't send an Authorization header).

const urlCache = new Map<string, Promise<string>>();

function useBlobUrl(file: FileDTO, enabled: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let p = urlCache.get(file.id);
    if (!p) {
      p = Api.fileBlob(file.url).then((b) => URL.createObjectURL(b));
      urlCache.set(file.id, p);
      p.catch(() => urlCache.delete(file.id));
    }
    p.then((u) => !cancelled && setUrl(u)).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file.id, file.url, enabled]);
  return url;
}

const formatSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function Attachment({ file }: { file: FileDTO }) {
  const [open, setOpen] = useState(false);
  const src = useBlobUrl(file, file.isImage);

  if (file.isImage) {
    return (
      <>
        <button onClick={() => setOpen(true)} className="mt-2 block overflow-hidden rounded-lg border border-black/30 bg-[#1e1f22]" title={file.name}>
          {src ? <img src={src} alt={file.name} className="max-h-72 max-w-sm object-contain" /> : <div className="flex h-32 w-48 items-center justify-center text-gray-500"><Loader2 className="animate-spin" size={18} /></div>}
        </button>
        {open && src && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6" onClick={() => setOpen(false)}>
            <button className="absolute right-5 top-5 text-white/70 hover:text-white" aria-label="Close preview"><X size={24} /></button>
            <img src={src} alt={file.name} className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
            <button onClick={(e) => { e.stopPropagation(); void downloadFile(file); }} className="absolute bottom-6 flex items-center gap-2 rounded bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"><Download size={14} /> Download</button>
          </div>
        )}
      </>
    );
  }

  return (
    <button onClick={() => void downloadFile(file)} className="mt-2 flex w-72 items-center gap-3 rounded-lg border border-black/30 bg-[#2b2d31] p-3 text-left transition hover:bg-[#35373c]">
      <FileText size={28} className="shrink-0 text-[#80848e]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[#00a8fc]">{file.name}</span>
        <span className="text-[11px] text-[#949ba4]">{formatSize(file.size)}</span>
      </span>
      <Download size={16} className="shrink-0 text-[#b5bac1]" />
    </button>
  );
}
