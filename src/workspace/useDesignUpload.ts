import { useEffect, useRef, useState } from 'react';
import { Upload as TusUpload } from 'tus-js-client';
import { api, post } from '../api';

export type UploadPhase =
  'idle' | 'hashing' | 'uploading' | 'paused' | 'processing' | 'done' | 'error';
export interface UploadRevision {
  id: string;
  document_id: string;
  status: string;
  seq: number;
  step?: string;
  error?: string;
}
interface Options {
  projectId?: string;
  loadDocuments: () => Promise<void>;
  loadDocument: (id: string) => Promise<unknown>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}

export function useDesignUpload({
  projectId,
  loadDocuments,
  loadDocument,
  setError,
  setNotice,
}: Options) {
  const [showUpload, setShowUpload] = useState(false);
  const [file, setFile] = useState<File | null>(null),
    [target, setTarget] = useState(''),
    [documentName, setDocumentName] = useState(''),
    [note, setNote] = useState(''),
    [phase, setPhase] = useState<UploadPhase>('idle'),
    [progress, setProgress] = useState(0),
    [currentRevision, setCurrentRevision] = useState<UploadRevision | null>(null);
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
      const r = await api(`/revisions/${id}`);
      setCurrentRevision(r);
      if (r.status === 'ready' || r.status === 'failed') {
        setPhase(r.status === 'ready' ? 'done' : 'error');
        setNotice(
          r.status === 'ready'
            ? '设计稿已就绪，可以打开固定链接'
            : r.error || '处理失败，可重新解析',
        );
        await loadDocuments();
        await loadDocument(r.document_id);
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
    if (uploadBusy.current || !file || !projectId) return;
    uploadBusy.current = true;
    setError('');
    setNotice('');
    setPhase('hashing');
    setProgress(0);
    setCurrentRevision(null);
    try {
      const hash = await hashFile(file);
      if (!alive.current) return;
      const preflight = await post('/uploads/preflight', {
        projectId,
        documentId: target || undefined,
        documentName: documentName || file.name.replace(/\.sketch$/i, ''),
        filename: file.name,
        size: file.size,
        sha256: hash,
        note,
      });
      setCurrentRevision(preflight.revision);
      setTarget(preflight.documentId);
      await loadDocuments();
      await loadDocument(preflight.documentId);
      if (preflight.kind === 'duplicate') {
        setPhase('done');
        setNotice(`文件内容与 r${preflight.revision.seq} 一致，未重复传输或新增记录`);
        return;
      }
      if (preflight.kind === 'reused') {
        setNotice('已找到相同原文件，无需传输，正在准备查看数据');
        setPhase('processing');
        await poll(preflight.revision.id);
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
      await poll(preflight.revision.id);
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
      await post(`/revisions/${id}/retry`);
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
    setCurrentRevision(null);
    setError('');
    if (!documentName) setDocumentName(next.name.replace(/\.sketch$/i, ''));
  }
  function beginUpload(documentId = '', nextFile?: File) {
    setShowUpload(true);
    if (active) return;
    setTarget(documentId);
    setFile(null);
    setDocumentName('');
    setNote('');
    setPhase('idle');
    setCurrentRevision(null);
    setError('');
    setNotice('');
    if (nextFile) {
      if (!nextFile.name.toLowerCase().endsWith('.sketch')) setError('请选择 .sketch 文件');
      else {
        setFile(nextFile);
        setDocumentName(nextFile.name.replace(/\.sketch$/i, ''));
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
            ? currentRevision?.step || '正在准备设计'
            : '设计已就绪';

  return {
    showUpload,
    setShowUpload,
    file,
    target,
    setTarget,
    documentName,
    setDocumentName,
    note,
    setNote,
    phase,
    progress,
    currentRevision,
    active,
    uploadLabel,
    chooseFile,
    beginUpload,
    startUpload,
    pause,
    retry,
  };
}
