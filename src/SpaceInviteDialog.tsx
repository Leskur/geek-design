import { useEffect, useRef, useState } from 'react';
import { Check, Copy, LoaderCircle } from 'lucide-react';
import { post } from './api';
import { copyText } from './clipboard';
import { Dialog } from './Dialog';

export function SpaceInviteDialog({
  space,
  onClose,
}: {
  space: { id: string; name: string };
  onClose: () => void;
}) {
  const [link, setLink] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const working = useRef(false),
    alive = useRef(true);
  async function generate() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await post(`/spaces/${space.id}/invitations`, {});
      if (alive.current) setLink(`${location.origin}/invite/${result.token}`);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void generate();
    return () => {
      alive.current = false;
    };
  }, [space.id]);
  async function copy() {
    try {
      await copyText(link);
      setCopied(true);
    } catch {
      setError('复制失败，请选择链接文本手动复制');
    }
  }
  return (
    <Dialog title="邀请成员" onClose={onClose}>
      <div className="wb-upload-body">
        <p className="wb-dialog-description">分享链接，邀请同事加入「{space.name}」。</p>
        {busy ? (
          <div className="management-invite-loading" role="status">
            <LoaderCircle size={20} className="wb-spin" />
            正在生成邀请链接…
          </div>
        ) : (
          link && (
            <>
              <div className="invite-copy">
                <input
                  aria-label="邀请链接"
                  value={link}
                  readOnly
                  spellCheck={false}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'a') {
                      e.preventDefault();
                      e.stopPropagation();
                      e.currentTarget.select();
                    }
                  }}
                />
              </div>
              <p className="management-caption">7 天内有效，仅供一位成员使用。</p>
            </>
          )
        )}
        {error && (
          <p className="team-error" role="alert">
            {error}
          </p>
        )}
        <div className="wb-dialog-actions">
          <button onClick={onClose}>关闭</button>
          {link ? (
            <button className="primary" onClick={() => void copy()}>
              {copied ? <Check size={15} /> : <Copy size={15} />}{' '}
              {copied ? '已复制' : '复制邀请链接'}
            </button>
          ) : (
            error && (
              <button className="primary" disabled={busy} onClick={() => void generate()}>
                重新生成
              </button>
            )
          )}
        </div>
      </div>
    </Dialog>
  );
}
