import { useEffect, useRef, useState } from 'react';
import { FileImage, LoaderCircle } from 'lucide-react';
export function DesignCover({
  documentId,
  revisionId,
  status,
}: {
  documentId: string;
  revisionId?: string;
  status?: string;
}) {
  const element = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [url, setUrl] = useState(''),
    [waiting, setWaiting] = useState(!!revisionId);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '160px' },
    );
    observer.observe(element.current!);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible || !revisionId) {
      setWaiting(false);
      return;
    }
    const abort = new AbortController();
    let objectUrl = '',
      timer: ReturnType<typeof setTimeout> | undefined;
    setWaiting(true);
    async function load(attempt = 0) {
      try {
        const r = await fetch(
          `/api/documents/${encodeURIComponent(documentId)}/cover?revision=${encodeURIComponent(revisionId!)}`,
          { credentials: 'same-origin', signal: abort.signal },
        );
        if (r.status === 202 && attempt < 30) {
          timer = setTimeout(() => void load(attempt + 1), 2000);
          return;
        }
        if (r.ok && r.status === 200 && r.headers.get('content-type')?.includes('image/webp')) {
          const blob = await r.blob();
          if (abort.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
        setWaiting(false);
      } catch {
        if (!abort.signal.aborted) setWaiting(false);
      }
    }
    void load();
    return () => {
      abort.abort();
      if (timer) clearTimeout(timer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [visible, documentId, revisionId]);
  return (
    <div ref={element} className={`project-design-cover${url ? ' has-image' : ''}`}>
      {url ? (
        <img src={url} alt="" draggable={false} decoding="async" onError={() => setUrl('')} />
      ) : (
        <div className="project-cover-placeholder">
          <FileImage size={30} strokeWidth={1.3} />
          <span>
            {status === 'failed'
              ? '处理失败'
              : !revisionId
                ? '等待文件就绪'
                : waiting
                  ? '封面准备中'
                  : '暂无封面'}
          </span>
          {waiting && <LoaderCircle size={13} className="wb-spin" />}
        </div>
      )}
    </div>
  );
}
