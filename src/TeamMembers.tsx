import { ManagementSearch } from './ManagementSearch';
import { Check, LoaderCircle, Users, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, post } from './api';
import { Choice } from './Choice';
import { Dialog } from './Dialog';
export const roleName = (role: string) =>
  (
    ({
      owner: '拥有者',
      admin: '管理员',
      member: '成员',
      designer: '可上传',
      viewer: '可查看',
    }) as Record<string, string>
  )[role] || role;
export function TeamMembers({ team, me }: { team: any; me: any }) {
  const [members, setMembers] = useState<any[]>([]),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState(''),
    [remove, setRemove] = useState<any>(null);
  const manage = team.role !== 'member',
    working = useRef(false),
    alive = useRef(true);
  async function refresh() {
    const people = await api<any[]>(`/teams/${team.id}/members`);
    if (!alive.current) return;
    setMembers(people);
    setLoaded(true);
  }
  useEffect(() => {
    alive.current = true;
    void refresh().catch((e) => {
      if (alive.current) setError(e.message);
    });
    return () => {
      alive.current = false;
    };
  }, [team.id]);
  async function action(task: () => Promise<unknown>, message = '') {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await task();
      await refresh();
      if (alive.current && message) setNotice(message);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const filtered = members.filter((m) =>
    m.username.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <div className="management-members">
      {error && !remove && (
        <div className="team-error" role="alert">
          {error}
          <button type="button" onClick={() => void action(async () => {})}>
            重新加载
          </button>
        </div>
      )}
      {notice && (
        <div className="wb-notice" role="status">
          <Check size={16} />
          <span>{notice}</span>
          <button className="wb-icon-button" aria-label="关闭提示" onClick={() => setNotice('')}>
            <X size={14} />
          </button>
        </div>
      )}

      <ManagementSearch
        label="搜索成员"
        value={query}
        onChange={setQuery}
        disabled={!loaded}
        result={query ? `${filtered.length} 位匹配成员` : undefined}
      />
      {!loaded && !error ? (
        <div className="wb-loading" role="status">
          <LoaderCircle size={20} className="wb-spin" />
          正在读取成员…
        </div>
      ) : (
        loaded && (
          <section
            className={filtered.length ? 'management-panel' : 'management-empty-panel'}
            aria-label="团队成员"
          >
            <>
              {filtered.map((m) => (
                <div className="member-row" key={m.user_id}>
                  <span className="member-avatar">
                    {Array.from(m.username as string)[0]?.toUpperCase()}
                  </span>
                  <div className="member-identity">
                    <b>
                      {m.username}
                      {m.user_id === me.id && <small>你</small>}
                    </b>
                    <span>{roleName(m.role)}</span>
                  </div>
                  {team.role === 'owner' && m.role !== 'owner' ? (
                    <Choice
                      disabled={busy}
                      label={`${m.username}的团队角色`}
                      value={m.role}
                      options={[
                        { id: 'member', name: '成员' },
                        { id: 'admin', name: '管理员' },
                      ]}
                      onChange={(role) =>
                        void action(
                          () => post(`/teams/${team.id}/members/${m.user_id}`, { role }),
                          '成员角色已更新',
                        )
                      }
                    />
                  ) : (
                    <span className="management-role">{roleName(m.role)}</span>
                  )}
                  {manage &&
                    m.role !== 'owner' &&
                    (team.role === 'owner' || m.role === 'member') && (
                      <button
                        className="quiet management-remove"
                        disabled={busy}
                        onClick={() => {
                          setError('');
                          setRemove(m);
                        }}
                      >
                        移除
                      </button>
                    )}
                </div>
              ))}
              {!filtered.length && (
                <div className="wb-soft-empty">
                  <Users size={28} />
                  <h3>没有找到匹配的成员</h3>
                  <button onClick={() => setQuery('')}>清除搜索</button>
                </div>
              )}
            </>
          </section>
        )
      )}
      {remove && (
        <Dialog
          title="移除团队成员"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <div className="wb-upload-body">
            <p className="wb-dialog-description">
              将「{remove.username}」移出团队？移除后，对方将失去此团队及其项目的访问权。
            </p>
            {error && (
              <p className="team-error" role="alert">
                {error}
              </p>
            )}
            <div className="wb-dialog-actions">
              <button disabled={busy} onClick={() => setRemove(null)}>
                取消
              </button>
              <button
                className="gd-danger-button"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await api(`/teams/${team.id}/members/${remove.user_id}`, { method: 'DELETE' });
                    setRemove(null);
                  }, '成员已移除')
                }
              >
                {busy ? '移除中…' : '确认移除'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
