import { ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, post } from './api';
import { spacePath } from './routes';
export function InviteScreen({ token, me }: { token: string; me: any }) {
  const [invite, setInvite] = useState<any>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('/invitations/' + encodeURIComponent(token))
      .then(setInvite)
      .catch((e) => setError(e.message));
  }, [token]);
  const next = encodeURIComponent('/invite/' + token);
  return (
    <main className="team-auth invite-screen">
      <div className="auth-mark">
        <ArrowUpRight size={25} />
      </div>
      <div className="eyebrow">BETTER TOGETHER</div>
      <h1>{invite ? `加入 ${invite.spaceName}` : '空间邀请'}</h1>
      {invite && (
        <>
          <p>
            你受邀加入协作空间。
            <br />
            接受后即可查看并上传该空间中的设计。
          </p>
          <div className="invitation-summary">
            <span>邀请状态</span>
            <b>
              {
                (
                  {
                    active: '等待你加入',
                    revoked: '已撤销',
                    expired: '已过期',
                    accepted: '已被使用',
                  } as any
                )[invite.status]
              }
            </b>
            <small>有效期至 {new Date(invite.expires).toLocaleString('zh-CN')}</small>
          </div>
          {invite.status === 'active' || (invite.status === 'accepted' && me) ? (
            me ? (
              <>
                <p>
                  当前账号：<strong>{me.username}</strong>
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const r = await post(`/invitations/${token}/accept`);
                      location.assign(spacePath(r.spaceId));
                    } catch (e) {
                      setError((e as Error).message);
                      setBusy(false);
                    }
                  }}
                >
                  接受邀请并进入空间
                </button>
              </>
            ) : (
              <div className="invite-auth-actions">
                <a className="primary" href={'/register?next=' + next}>
                  注册账号并加入
                </a>
                <a href={'/login?next=' + next}>已有账号，登录</a>
              </div>
            )
          ) : (
            <p>请向空间拥有者索取新的邀请链接。</p>
          )}
        </>
      )}
      {error && (
        <div className="team-error" role="alert">
          {error}
        </div>
      )}
      <a className="team-link" href="/spaces">
        返回我的空间
      </a>
    </main>
  );
}
