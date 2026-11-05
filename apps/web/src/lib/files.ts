import type { FileDTO } from '@repo/shared-types';
import { useAppStore } from '../store/useAppStore';
import { Api } from './api';

export async function downloadFile(file: FileDTO): Promise<void> {
  try {
    const blob = await Api.fileBlob(file.url, true);
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    useAppStore.getState().toast('Download failed', 'error');
  }
}
