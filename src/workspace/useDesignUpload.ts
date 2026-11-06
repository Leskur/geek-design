import { useEffect, useRef, useState } from 'react';
import { Upload as TusUpload } from 'tus-js-client';
import { api, post } from '../api';

export type UploadPhase =
  | 'idle'
  | 'hashing'
  | 'uploading'
  | 'paused'
  | 'processing'
  | 'done'
  | 'error';
export interface UploadDesign {
  id: string;
  space_id: string;
  folder_id: string | null;
  status: string;
  step?: string;
  error?: string;
}
interface Options {
  spaceId?: string;
  folderId?: string;
  loadDesigns: () => Promise<void>;
  loadDesign: (id: string) => Promise<unknown>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

export function useDesignUpload({
  spaceId,
  folderId,
  loadDesigns,
  loadDesign,
  setError,
  setNotice,
}: Options) {
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [target, setTarget] = useState(''),
    [designName, setDesignName] = useState(''),
    [phase, setPhase] = useState<UploadPhase>('idle'),
    [progress, setProgress] = useState(0),
    [currentDesign, setCurrentDesign] = useState<UploadDesign | null>(null);
  const worker = useRef<Worker | null>(null),
    tus = useRef<TusUpload | null>(null),
    rejectHash = useRef<((e: Error) => void) | null>(null),
    alive = useRef(true),
    uploadBusy = useRef(false);

  const active = ['hashing', 'uploading', 'paused', 'processing'].includes(phase);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      worker.current?.terminate();
      void tus.current?.abort();
    };
  }, []);
  function hashFile(f: File) {
    return new Promise<string>((resolve, reject) => {
      const w = new Worker(new URL('../hash.worker.ts', import.meta.url), { type: 'module' });
      worker.current = w;
      rejectHash.current = reject;
      w.onmessage = ({ data }) => {
        if (data.error) {
          w.terminate();
          reject(new Error(data.error));
        } else if (data.hash) {
          w.terminate();
          worker.current = null;
          rejectHash.current = null;
          resolve(data.hash);
        } else setProgress(data.progress);
      };
      w.onerror = () => {
        w.terminate();
        reject(new Error('文件校验失败，请重新选择文件'));
      };
      w.postMessage(f);
    });
  }
  async function poll(id: string) {
    for (;;) {
      if (!alive.current) return;
      const d = await api(`/designs/${id}`);
      setCurrentDesign(d);
      if (d.status === 'ready' || d.status === 'failed') {
        setPhase(d.status === 'ready' ? 'done' : 'error');
        if (d.status === 'ready') setNotice('设计稿已就绪，可以打开');
        else setError(d.error || '处理失败，可重新解析');
        await loadDesigns();
        await loadDesign(d.id);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
  async function startUpload() {
    if (phase === 'paused' && tus.current) {
      setPhase('uploading');
      tus.current.start();
      return;
    }
    if (uploadBusy.current || !file || !spaceId) return;
    uploadBusy.current = true;
    setError('');
    setNotice('');
    setPhase('hashing');
    setProgress(0);
    setCurrentDesign(null);
    try {
      const hash = await hashFile(file);
      if (!alive.current) return;
      const preflight = await post('/uploads/preflight', {
        spaceId,
        ...(folderId ? { folderId } : {}),
        designId: target || undefined,
        designName: designName || file.name.replace(/\.sketch$/i, ''),
        filename: file.name,
        size: file.size,
        sha256: hash,
      });
      setCurrentDesign(preflight.design);
      setTarget(preflight.design.id);
      await loadDesigns();
      await loadDesign(preflight.design.id);
      if (preflight.kind === 'duplicate') {
        setPhase('done');
        setNotice('文件内容与当前设计一致，未重复传输');
        return;
      }
      if (preflight.kind === 'reused') {
        setNotice('已找到相同原文件，无需传输，正在准备查看数据');
        setPhase('processing');
        await poll(preflight.design.id);
        return;
      }
      if (preflight.kind === 'upload') {
        const ticket = await api(`/uploads/${preflight.ticket}`);
        setPhase('uploading');
        setProgress(ticket.offset / file.size);
        await new Promise<void>((resolve, reject) => {
          const upload = new TusUpload(file, {
            endpoint: '/api/tus',
            ...(ticket.exists ? { uploadUrl: ticket.url } : {}),
            metadata: { ticket: preflight.ticket },
            chunkSize: 8 * 1024 ** 2,
            retryDelays: [0, 1000, 3000, 5000],
            storeFingerprintForResuming: false,
            onProgress: (sent, total) => {
              if (alive.current) setProgress(sent / total);
            },
            onSuccess: () => resolve(),
            onError: reject,
          });
          tus.current = upload;
          upload.start();
        });
        await post(`/uploads/${preflight.ticket}/complete`);
        tus.current = null;
      }
      setPhase('processing');
      await poll(preflight.design.id);
    } catch (e) {
      if (alive.current) {
        setError((e as Error).message);
        setPhase('error');
      }
    } finally {
      uploadBusy.current = false;
    }
  }
  async function pause() {
    if (phase === 'uploading' && tus.current) {
      await tus.current.abort();
      setPhase('paused');
    } else if (phase === 'hashing') {
      worker.current?.terminate();
      worker.current = null;
      rejectHash.current?.(new Error('本地校验已停止，文件尚未传输'));
      rejectHash.current = null;
    }
  }
  async function retry(id: string) {
    try {
      await post(`/designs/${id}/retry`);
      setPhase('processing');
      await poll(id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function chooseFile(next: File) {
    if (!next.name.toLowerCase().endsWith('.sketch')) {
      setError('请选择 .sketch 文件');
      return;
    }
    setFile(next);
    setPhase('idle');
    setCurrentDesign(null);
    setError('');
    if (!designName) setDesignName(next.name.replace(/\.sketch$/i, ''));
  }
  function beginUpload(designId = '', nextFile?: File) {
    setShowUpload(true);
    if (active) return;
    setTarget(designId);
    setFile(null);
    setDesignName('');
    setPhase('idle');
    setCurrentDesign(null);
    setError('');
    setNotice('');
    if (nextFile) {
      if (!nextFile.name.toLowerCase().endsWith('.sketch')) setError('请选择 .sketch 文件');
      else {
        setFile(nextFile);
        setDesignName(nextFile.name.replace(/\.sketch$/i, ''));
      }
    }
  }
  const uploadLabel =
    phase === 'hashing'
      ? '正在识别文件内容'
      : phase === 'uploading'
        ? '正在上传设计'
        : phase === 'paused'
          ? '上传已暂停'
          : phase === 'processing'
            ? currentDesign?.step || '正在准备设计'
            : '设计已就绪';

  return {
    showUpload,
    setShowUpload,
    file,
    target,
    setTarget,
    designName,
    setDesignName,
    /** @deprecated alias */
    documentName: designName,
    setDocumentName: setDesignName,
    note: '',
    setNote: (_: string) => {},
    phase,
    progress,
    currentDesign,
    /** @deprecated alias */
    currentRevision: currentDesign,
    active,
    uploadLabel,
    chooseFile,
    beginUpload,
    startUpload,
    pause,
    retry,
  };
}
