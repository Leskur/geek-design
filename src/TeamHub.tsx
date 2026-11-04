import { TeamFonts } from './TeamFonts';
import { TeamSettings } from './TeamSettings';
import { TeamInviteDialog } from './TeamInviteDialog';
import { TeamPageHeader } from './TeamPageHeader';
import { Logo } from './Logo';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useDesignUpload } from './workspace/useDesignUpload';
import { UploadDialog } from './workspace/UploadDialog';
import { DesignList } from './workspace/DesignList';
import { size, label } from './workspace/format';
import { api, post } from './api';
import './team.css';
import './workbench.css';
import './team-tree.css';
import './theme.css';
import './management.css';
import { TeamTree } from './TeamTree';
import { TeamOverview } from './TeamOverview';
import {
  Folder,
  Plus,
  ChevronRight,
  Monitor,
  ArrowUpRight,
  LogOut,
  X,
  LoaderCircle,
  CircleCheck,
  Ellipsis,
  History,
  Upload,
  Link,
  Menu,
} from 'lucide-react';
import { Dialog } from './Dialog';
import { ContextMenu, type MenuPosition } from './ContextMenu';
import { Trash2, Pencil, FolderInput } from 'lucide-react';
import {
  preferredTeam,
  rememberTeam,
  migratePreferences,
  sortDesigns,
  workspaceView,
  rememberWorkspaceView,
  type DesignSort,
} from './workbench';
import { AccountScreen } from './AccountScreen';
import { InviteScreen } from './InviteScreen';
import { TeamMembers, roleName } from './TeamMembers';
import { Choice } from './Choice';
import { routeFor, projectPath, documentPath, revisionPath, teamPath, matchesId } from './routes';

export function TeamHub() {
  const [sidebarOpen, setSidebarOpen] = useState(false),
    [narrow, setNarrow] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null),
    menuToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = matchMedia('(max-width:760px)'),
      update = () => {
        setNarrow(media.matches);
        if (!media.matches) setSidebarOpen(false);
      };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    sidebarRef.current?.querySelector<HTMLElement>('a,button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      menuToggle.current?.focus();
    };
  }, [sidebarOpen]);
  const [projectMenu, setProjectMenu] = useState<MenuPosition | null>(null);
  const [accountMenu, setAccountMenu] = useState<MenuPosition | null>(null);
  const [inviteTeam, setInviteTeam] = useState<any>(null);
  const [sort, setSort] = useState<DesignSort>('updated');
  const [editing, setEditing] = useState<{
      kind: 'team' | 'project' | 'document';
      item: any;
      move: boolean;
    } | null>(null),
    [editName, setEditName] = useState(''),
    [moveProjectId, setMoveProjectId] = useState(''),
    [savingEdit, setSavingEdit] = useState(false),
    [editError, setEditError] = useState('');
  const [deletion, setDeletion] = useState<{
      kind: 'team' | 'project' | 'document';
      item: any;
    } | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(''),
    [fileMenu, setFileMenu] = useState<(MenuPosition & { item: any }) | null>(null);
  const route = routeFor(location.pathname, location.search);
  const [, setNavigationEpoch] = useState(0),
    [membersVisited, setMembersVisited] = useState(route.section === 'members'),
    [fontsVisited, setFontsVisited] = useState(route.section === 'fonts');
  useEffect(() => {
    const update = () => setNavigationEpoch((v) => v + 1);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  function switchTeamTab(
    e: MouseEvent<HTMLAnchorElement>,
    members: boolean,
    settings = false,
    fonts = false,
  ) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (members) setMembersVisited(true);
    if (fonts) setFontsVisited(true);
    const path =
      teamPath(team.id) + (fonts ? '/fonts' : settings ? '/settings' : members ? '/members' : '');
    if (location.pathname !== path) history.pushState(null, '', path);
    setNavigationEpoch((v) => v + 1);
  }

  const [createProjectTeamId, setCreateProjectTeamId] = useState('');
  const [spaceLoaded, setSpaceLoaded] = useState(false),
    [documentsLoaded, setDocumentsLoaded] = useState(false),
    [files, setFiles] = useState<any[]>([]),
    [showHistory, setShowHistory] = useState(false),
    [createKind, setCreateKind] = useState<'team' | 'project' | null>(null),
    [creatingProject, setCreatingProject] = useState(false),
    [search, setSearch] = useState(''),
    [listView, setListView] = useState(false);
  const [loaded, setLoaded] = useState(false),
    [teams, setTeams] = useState<any[]>([]),
    [team, setTeam] = useState<any>(null),
    [newTeam, setNewTeam] = useState(''),
    [creatingTeam, setCreatingTeam] = useState(false);
  const [me, setMe] = useState<any>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [projects, setProjects] = useState<any[]>([]),
    [project, setProject] = useState<any>(null),
    [documents, setDocuments] = useState<any[]>([]),
    [document, setDocument] = useState<any>(null),
    [members, setMembers] = useState<any[]>([]),
    [users, setUsers] = useState<any[]>([]),
    [showMembers, setShowMembers] = useState(false),
    [newProject, setNewProject] = useState('');
  const upload = useDesignUpload({
    projectId: project?.id,
    loadDocuments,
    loadDocument,
    setError,
    setNotice,
  });
  const {
    showUpload,
    setShowUpload,
    target,
    setTarget,
    phase,
    active,
    uploadLabel,
    beginUpload,
    retry,
  } = upload;
  useEffect(() => {
    if (me) {
      const view = workspaceView(me.id);
      setListView(view.list);
      setSort(view.sort);
    }
  }, [me?.id]);
  function changeView(list: boolean) {
    setListView(list);
    rememberWorkspaceView(me.id, list, sort);
  }
  function changeSort(order: DesignSort) {
    setSort(order);
    rememberWorkspaceView(me.id, listView, order);
  }
  const mayUpload = !!me && (project?.role === 'owner' || project?.role === 'designer');
  const owner = !!me && project?.role === 'owner';
  function requestDelete(kind: 'team' | 'project' | 'document', item: any) {
    setDeleteError('');
    setDeletion({ kind, item });
  }
  function canDeleteFile(d: any) {
    const p = projects.find((p) => p.id === (d.project_id || project?.id));
    return p?.role === 'owner' || p?.role === 'designer';
  }
  async function removeItem() {
    if (!deletion || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api(
        `/${deletion.kind === 'team' ? 'teams' : deletion.kind === 'project' ? 'projects' : 'documents'}/${deletion.item.id}`,
        { method: 'DELETE' },
      );
      if (deletion.kind === 'team') {
        location.assign('/teams');
        return;
      }
      if (deletion.kind === 'project') {
        location.assign(teamPath(deletion.item.team_id));
        return;
      }
      if (project) await loadDocuments();
      else if (team) setFiles(await api(`/teams/${team.id}/files`));
      setDeletion(null);
      setNotice('设计已删除');
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  function moveTargets(d: any) {
    const source = projects.find((p) => p.id === (d.project_id || project?.id));
    return projects.filter(
      (p) =>
        p.team_id === source?.team_id &&
        p.id !== source?.id &&
        ['owner', 'designer'].includes(p.role),
    );
  }
  function requestEdit(kind: 'team' | 'project' | 'document', item: any, move = false) {
    setEditName(item.name);
    setMoveProjectId(move ? moveTargets(item)[0]?.id || '' : '');
    setEditError('');
    setEditing({ kind, item, move });
  }
  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing || savingEdit) return;
    setSavingEdit(true);
    setEditError('');
    try {
      const { kind, item, move } = editing;
      if (move) await post(`/documents/${item.id}/move`, { projectId: moveProjectId });
      else
        await api(
          `/${kind === 'team' ? 'teams' : kind === 'project' ? 'projects' : 'documents'}/${item.id}`,
          { method: 'PATCH', body: JSON.stringify({ name: editName }) },
        );
      await loadProjects();
      if (project) await loadDocuments();
      if (kind === 'document' && document?.id === item.id) {
        if (move) {
          setShowHistory(false);
          setDocument(null);
          history.replaceState(null, '', projectPath(project.id));
        } else setDocument({ ...document, name: editName.trim() });
      }
      if (move && target === item.id) setTarget('');
      setEditing(null);
      setNotice(move ? '设计已移动，历史版本和预览已保留' : '名称已更新');
    } catch (e) {
      setEditError((e as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }
  async function refreshAuth() {
    try {
      const u = await api('/me');
      migratePreferences(u.id, u.legacy_id);
      setMe(u);
    } catch (e) {
      if ((e as any).status !== 401) throw e;
      if (!route.auth && !route.inviteToken)
        location.replace(
          '/login' +
            (location.pathname === '/'
              ? ''
              : '?next=' + encodeURIComponent(location.pathname + location.search)),
        );
    } finally {
      setLoaded(true);
    }
  }
  async function loadProjects() {
    const [allTeams, all] = await Promise.all([api<any[]>('/teams'), api<any[]>('/projects')]);
    setTeams(allTeams);
    if (route.auth || route.inviteToken) return;
    const requested = route.projectId ? all.find((p) => matchesId(route.projectId, p)) : null;
    if (route.projectId && !requested) throw new Error('项目不存在或无权访问');
    const id = route.teamId || requested?.team_id || preferredTeam(me.id, allTeams),
      selected = allTeams.find((t) => matchesId(id, t));
    if (id && !selected) throw new Error('团队不存在或无权访问');
    setTeam(selected || null);
    setProjects(all);
    setProject(requested || null);
    if (selected) {
      rememberTeam(me.id, selected.id);
      setFiles(await api(`/teams/${selected.id}/files`));
      if (!requested)
        history.replaceState(
          null,
          '',
          teamPath(selected.id) +
            (route.section === 'members'
              ? '/members'
              : route.section === 'settings'
                ? '/settings'
                : route.section === 'fonts'
                  ? '/fonts'
                  : '') +
            location.search,
        );
      else if (route.projectId !== requested.id)
        history.replaceState(
          null,
          '',
          projectPath(requested.id) +
            (route.documentId ? '/documents/' + encodeURIComponent(route.documentId) : '') +
            location.search,
        );
    }
  }
  async function loadDocuments(id = project?.id) {
    if (!id) return;
    setDocumentsLoaded(false);
    try {
      const list = await api(`/projects/${id}/documents`);
      setDocuments(list);
      if (team) setFiles(await api(`/teams/${team.id}/files`));
    } finally {
      setDocumentsLoaded(true);
    }
  }
  async function loadDocument(id: string, reveal = false) {
    try {
      const d = await api(`/documents/${id}`);
      if (project && d.project_id !== project.id) throw new Error('文档不属于当前项目');
      setDocument(d);
      if (reveal) {
        setShowHistory(true);
        history.replaceState(null, '', documentPath(d.project_id, d.id));
      }
      return d;
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    refreshAuth().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (me)
      loadProjects()
        .catch((e) => setError(e.message))
        .finally(() => setSpaceLoaded(true));
  }, [me]);
  useEffect(() => {
    setDocument(null);
    setTarget('');
    if (project) {
      loadDocuments(project.id).catch((e) => setError(e.message));
      const route = routeFor(location.pathname, location.search);
      const id = route.documentId;
      if (id) void loadDocument(id, true);
      else history.replaceState(null, '', projectPath(project.id));
    }
  }, [project?.id]);
  async function createTeam(e: FormEvent) {
    e.preventDefault();
    if (creatingTeam) return;
    setCreatingTeam(true);
    setError('');
    try {
      const t = await post('/teams', { name: newTeam });
      location.assign(teamPath(t.id));
    } catch (e) {
      setError((e as Error).message);
      setCreatingTeam(false);
    }
  }
  function openCreateProject(teamId = team?.id) {
    setCreateProjectTeamId(teamId || '');
    setNewProject('');
    setError('');
    setCreateKind('project');
  }
  async function createProject(e: FormEvent) {
    e.preventDefault();
    if (creatingProject) return;
    setCreatingProject(true);
    setError('');
    try {
      const p = await post('/projects', {
        teamId: createProjectTeamId || team.id,
        name: newProject,
      });
      location.assign(projectPath(p.id));
    } catch (e) {
      setError((e as Error).message);
      setCreatingProject(false);
    }
  }
  async function manage() {
    try {
      setMembers(await api(`/projects/${project.id}/members`));
      setUsers(
        (await api<any[]>(`/teams/${team.id}/members`)).map((m) => ({
          id: m.user_id,
          username: m.username,
        })),
      );
      setShowMembers(true);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addMember(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await post(`/projects/${project.id}/members`, {
        userId: form.get('userId'),
        role: form.get('role'),
      });
      await manage();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function makeCurrent(id: string) {
    try {
      await post(`/documents/${document.id}/current`, { revisionId: id });
      await loadDocument(document.id);
      await loadDocuments();
      setNotice('当前稿已更新；原固定链接保持不变');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copyLink(id: string, docId = document?.id) {
    if (!docId) return;
    const link = `${location.origin}${revisionPath(project.id, docId, id)}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('链接已复制');
    } catch {
      setNotice(link);
    }
  }
  const workspaceReady = loaded && (!me || !!route.auth || !!route.inviteToken || spaceLoaded);
  const visibleFiles = sortDesigns(
    (project ? documents : files).filter((d) =>
      `${d.name} ${d.project_name || ''}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    ),
    sort,
  );
  const canCreateProject = team && team.role !== 'member';
  const icon = (Icon: any) => <Icon size={20} strokeWidth={2} aria-hidden="true" />;
  const alert = error && (
    <div className="team-error" role="alert">
      {error}
      <button type="button" aria-label="关闭错误提示" onClick={() => setError('')}>
        <X size={14} />
      </button>
    </div>
  );
  const authShell = (content: React.ReactNode) => (
    <div className="team-app">
      <header>
        <a className="brand brand-link" href="/teams">
          <Logo size={32} />
          Geek<span>Design</span>
        </a>
        <div className="filename" />
        <a className="team-link" href="/local" target="_blank" rel="noopener noreferrer">
          本地文件查看
        </a>
      </header>
      {content}
    </div>
  );
  if (!loaded)
    return authShell(
      <main className="team-auth">
        <LoaderCircle className="wb-spin" size={23} />
        <p>{error || '正在连接…'}</p>
        {error && (
          <button onClick={() => refreshAuth().catch((e) => setError(e.message))}>重新连接</button>
        )}
      </main>,
    );
  if (route.inviteToken) return authShell(<InviteScreen token={route.inviteToken} me={me} />);
  if (!me || route.auth) return authShell(<AccountScreen register={route.auth === 'register'} />);
  const emptyProject = project && documentsLoaded && !documents.length;
  return (
    <div className={`team-app wb-app${sidebarOpen ? ' navigation-open' : ''}`}>
      <aside
        ref={sidebarRef}
        id="management-sidebar"
        className="wb-sidebar"
        inert={narrow && !sidebarOpen}
        aria-hidden={narrow && !sidebarOpen ? true : undefined}
      >
        <a className="brand brand-link" href="/teams">
          <Logo size={30} />
          Geek<span>Design</span>
        </a>

        <TeamTree
          userId={me.id}
          teams={teams}
          projects={projects}
          activeTeamId={team?.id}
          activeProjectId={project?.id}
          overviewPage={route.section === 'overview'}
          busy={active}
          onCreateTeam={() => {
            setError('');
            setNewTeam('');
            setCreateKind('team');
          }}
          onCreateProject={openCreateProject}
          onDelete={requestDelete}
          onRename={(kind, item) => requestEdit(kind, item)}
        />
        <button
          className="wb-icon-button management-drawer-close"
          aria-label="关闭侧边栏"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={18} />
        </button>
        <div className="wb-sidebar-bottom">
          <a href="/local" target="_blank" rel="noopener noreferrer">
            {icon(Monitor)}本地文件查看
            <ArrowUpRight size={14} />
          </a>
        </div>
      </aside>
      {narrow && sidebarOpen && (
        <button
          className="management-nav-backdrop"
          aria-label="关闭导航"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="wb-stage" inert={narrow && sidebarOpen}>
        <header className="wb-toolbar">
          <button
            ref={menuToggle}
            className="wb-icon-button management-menu-toggle"
            aria-label={sidebarOpen ? '收起导航' : '展开导航'}
            aria-expanded={sidebarOpen}
            aria-controls="management-sidebar"
            onClick={() => setSidebarOpen((v) => !v)}
          >
            <Menu size={19} />
          </button>
          <button
            className="management-account-avatar"
            aria-label={`账号菜单：${me.username}`}
            title={me.username}
            aria-haspopup="menu"
            aria-expanded={!!accountMenu}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAccountMenu(accountMenu ? null : { x: r.right - 190, y: r.bottom + 8 });
            }}
          >
            {Array.from(me.username as string)[0]?.toUpperCase()}
          </button>
        </header>

        <main className="wb-content">
          {alert}
          {notice && (
            <div className="wb-notice" role="status">
              <CircleCheck size={16} />
              <span>{notice}</span>
              <button
                className="wb-icon-button"
                aria-label="关闭提示"
                onClick={() => setNotice('')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {!workspaceReady ? (
            <div className="wb-loading">
              <LoaderCircle size={22} className="wb-spin" />
              正在打开工作台…
            </div>
          ) : team && !project ? (
            <>
              <TeamPageHeader
                team={team}
                projectCount={projects.filter((p) => p.team_id === team.id).length}
                fileCount={files.length}
                members={route.section === 'members'}
                settings={route.section === 'settings'}
                fonts={route.section === 'fonts'}
                onNavigate={switchTeamTab}
                onRename={() => requestEdit('team', team)}
                onDelete={() => requestDelete('team', team)}
                onInvite={() => setInviteTeam(team)}
                onCreateProject={() => openCreateProject(team.id)}
              />
              {(fontsVisited || route.section === 'fonts') && (
                <div hidden={route.section !== 'fonts'}>
                  <TeamFonts key={team.id} team={team} />
                </div>
              )}
              {route.section === 'settings' && (
                <TeamSettings
                  team={team}
                  busy={active}
                  onRename={() => requestEdit('team', team)}
                  onDelete={() => requestDelete('team', team)}
                />
              )}
              <div
                hidden={
                  route.section === 'members' ||
                  route.section === 'settings' ||
                  route.section === 'fonts'
                }
              >
                <TeamOverview
                  team={team}
                  projects={projects.filter((p) => p.team_id === team.id)}
                  files={files}
                  onCreateProject={() => openCreateProject(team.id)}
                  onRename={(kind, item) => requestEdit(kind, item)}
                  onDelete={requestDelete}
                />
              </div>
              {(membersVisited || route.section === 'members') && (
                <div hidden={route.section !== 'members'}>
                  <TeamMembers key={team.id} team={team} me={me} />
                </div>
              )}
            </>
          ) : !team ? (
            <div className="wb-onboarding">
              <div className="wb-onboarding-art">
                <Folder size={62} strokeWidth={1} />
                <span>
                  <Plus size={18} />
                </span>
              </div>
              <h1>给设计一个共同的空间</h1>
              <p>
                创建团队，和伙伴一起查看、交付设计。
                <br />
                已经收到邀请？直接打开邀请链接即可。
              </p>
              <button
                className="primary"
                onClick={() => {
                  setError('');
                  setCreateKind('team');
                }}
              >
                <Plus size={16} />
                创建团队
              </button>
            </div>
          ) : (
            <>
              <div className="wb-page-heading project-page-heading">
                <div className="project-title-actions">
                  <h1>{project?.name || '设计文件'}</h1>
                  {owner && (
                    <button
                      className="wb-icon-button"
                      aria-label="项目操作"
                      title="项目操作"
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setProjectMenu({ x: rect.left, y: rect.bottom + 6 });
                      }}
                    >
                      <Ellipsis size={18} />
                    </button>
                  )}
                </div>
                {mayUpload && (
                  <button className="primary" onClick={() => beginUpload()}>
                    <Plus size={16} />
                    上传设计
                  </button>
                )}
              </div>
              <div>
                <DesignList
                  project={project}
                  emptyProject={!!emptyProject}
                  documentsLoaded={documentsLoaded}
                  visibleFiles={visibleFiles}
                  search={search}
                  setSearch={setSearch}
                  sort={sort}
                  changeSort={changeSort}
                  listView={listView}
                  changeView={changeView}
                  mayUpload={mayUpload}
                  active={active}
                  beginUpload={beginUpload}
                  setFileMenu={setFileMenu}
                  loadDocument={loadDocument}
                  copyLink={copyLink}
                  canDeleteFile={canDeleteFile}
                  canMoveFile={(d) => !!moveTargets(d).length}
                  requestEdit={requestEdit}
                  requestDelete={requestDelete}
                />
              </div>
            </>
          )}
        </main>
      </div>
      {projectMenu && project && (
        <ContextMenu position={projectMenu} onClose={() => setProjectMenu(null)}>
          <button disabled={active} onClick={() => requestEdit('project', project)}>
            <Pencil size={16} />
            重命名项目
          </button>
          <button
            className="danger"
            disabled={active}
            onClick={() => requestDelete('project', project)}
          >
            <Trash2 size={16} />
            删除项目
          </button>
        </ContextMenu>
      )}
      {accountMenu && (
        <ContextMenu position={accountMenu} onClose={() => setAccountMenu(null)}>
          <div className="management-account-name">
            <span>当前账号</span>
            <b>{me.username}</b>
          </div>
          <button
            disabled={active}
            onClick={async () => {
              try {
                await post('/logout');
                location.assign('/login');
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <LogOut size={16} />
            退出登录
          </button>
        </ContextMenu>
      )}
      {inviteTeam && (
        <TeamInviteDialog
          key={inviteTeam.id}
          team={inviteTeam}
          onClose={() => setInviteTeam(null)}
        />
      )}
      {editing && (
        <Dialog
          title={
            editing.move
              ? '移动设计'
              : `重命名${editing.kind === 'team' ? '团队' : editing.kind === 'project' ? '项目' : '设计'}`
          }
          onClose={() => {
            if (!savingEdit) setEditing(null);
          }}
        >
          <form className="wb-upload-body" onSubmit={saveEdit}>
            {editing.move ? (
              <>
                <p className="wb-dialog-description">
                  将「{editing.item.name}」及其全部历史版本移动到同一团队的其他项目。
                </p>
                <Choice
                  label="目标项目"
                  value={moveProjectId}
                  onChange={setMoveProjectId}
                  disabled={savingEdit}
                  options={moveTargets(editing.item).map((p) => ({ id: p.id, name: p.name }))}
                />
              </>
            ) : (
              <label className="wb-edit-name">
                名称
                <input
                  aria-label="名称"
                  autoFocus
                  data-dialog-initial-focus
                  value={editName}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={120}
                  required
                  disabled={savingEdit}
                />
              </label>
            )}
            {editError && (
              <p className="team-error" role="alert">
                {editError}
              </p>
            )}
            <div className="wb-dialog-actions">
              <button type="button" disabled={savingEdit} onClick={() => setEditing(null)}>
                取消
              </button>
              <button
                className="primary"
                disabled={savingEdit || (editing.move ? !moveProjectId : !editName.trim())}
              >
                {savingEdit ? '保存中…' : editing.move ? '移动' : '保存'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {fileMenu && (
        <ContextMenu position={fileMenu} onClose={() => setFileMenu(null)}>
          <a
            href={
              fileMenu.item.current_revision
                ? revisionPath(
                    fileMenu.item.project_id,
                    fileMenu.item.id,
                    fileMenu.item.current_revision,
                  )
                : projectPath(fileMenu.item.project_id)
            }
          >
            <ArrowUpRight size={16} />
            打开设计
          </a>
          {canDeleteFile(fileMenu.item) && (
            <>
              <button disabled={active} onClick={() => requestEdit('document', fileMenu.item)}>
                <Pencil size={16} />
                重命名设计
              </button>
              <button
                disabled={active || !moveTargets(fileMenu.item).length}
                onClick={() => requestEdit('document', fileMenu.item, true)}
              >
                <FolderInput size={16} />
                移动到项目
              </button>
            </>
          )}
          {canDeleteFile(fileMenu.item) && (
            <button
              className="danger"
              disabled={active}
              onClick={() => requestDelete('document', fileMenu.item)}
            >
              <Trash2 size={16} />
              删除设计
            </button>
          )}
        </ContextMenu>
      )}
      {deletion && (
        <Dialog
          title={`删除${deletion.kind === 'team' ? '团队' : deletion.kind === 'project' ? '项目' : '设计'}`}
          onClose={() => {
            if (!deleting) setDeletion(null);
          }}
        >
          <div className="gd-delete-body">
            <p>
              确定删除「<strong>{deletion.item.name}</strong>」？
            </p>
            <p>
              {deletion.kind === 'team'
                ? '团队下的全部项目、设计、上传记录和成员关系将一并删除。'
                : deletion.kind === 'project'
                  ? '项目下的全部设计、上传记录和项目权限将一并删除。'
                  : '该设计的全部稿件和上传记录将一并删除。'}{' '}
              此操作无法撤销。
            </p>
            <p className="gd-delete-note">共用的原文件与图片资源保留在服务器，不影响其他设计。</p>
            {deleteError && (
              <p className="team-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="wb-dialog-actions">
              <button disabled={deleting} onClick={() => setDeletion(null)}>
                取消
              </button>
              <button className="gd-danger-button" disabled={deleting} onClick={removeItem}>
                <Trash2 size={16} />
                {deleting ? '正在删除…' : '确认删除'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {createKind && (
        <Dialog
          title={createKind === 'team' ? '创建团队' : '新建项目'}
          onClose={() => {
            if (!creatingTeam && !creatingProject) setCreateKind(null);
          }}
        >
          <form
            className="wb-create-form"
            onSubmit={createKind === 'team' ? createTeam : createProject}
          >
            <p>
              {createKind === 'team'
                ? '为你的团队取一个名字，之后就可以邀请伙伴加入。'
                : `创建在「${teams.find((t) => t.id === createProjectTeamId)?.name || team?.name}」中。`}
            </p>
            <label>
              {createKind === 'team' ? '团队名称' : '项目名称'}
              <input
                autoFocus
                data-dialog-initial-focus
                required
                maxLength={120}
                placeholder={createKind === 'team' ? '例如：产品设计团队' : '例如：移动端设计'}
                value={createKind === 'team' ? newTeam : newProject}
                onChange={(e) =>
                  createKind === 'team' ? setNewTeam(e.target.value) : setNewProject(e.target.value)
                }
              />
            </label>
            {alert}
            <div className="wb-dialog-actions">
              <button
                type="button"
                onClick={() => setCreateKind(null)}
                disabled={creatingTeam || creatingProject}
              >
                取消
              </button>
              <button className="primary" disabled={creatingTeam || creatingProject}>
                {creatingTeam || creatingProject ? '正在创建…' : '创建'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {showUpload && project && (
        <UploadDialog
          upload={upload}
          projectId={project.id}
          targetName={documents.find((d) => d.id === target)?.name}
          alert={alert}
        />
      )}
      {showMembers && project && (
        <Dialog title="项目成员" onClose={() => setShowMembers(false)}>
          <div className="wb-upload-body">
            <p className="wb-dialog-description">团队拥有者和管理员可以管理此项目。</p>
            <div className="member-list">
              {members.map((m) => (
                <span key={m.user_id}>
                  {m.username} · {roleName(m.role)}
                  <button
                    aria-label={`取消${m.username}的项目权限`}
                    onClick={async () => {
                      try {
                        await api(`/projects/${project.id}/members/${m.user_id}`, {
                          method: 'DELETE',
                        });
                        await manage();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <form className="team-inline" onSubmit={addMember}>
              <Choice
                name="userId"
                label="选择团队成员"
                options={users.map((u) => ({ id: u.id, name: u.username }))}
              />
              <Choice
                name="role"
                label="项目权限"
                options={[
                  { id: 'viewer', name: '可查看' },
                  { id: 'designer', name: '可上传' },
                ]}
              />
              <button className="primary">添加</button>
            </form>
            {alert}
            <a className="team-link" href={teamPath(team.id) + '/members'}>
              邀请新的团队成员 <ArrowUpRight size={12} />
            </a>
          </div>
        </Dialog>
      )}
      {showHistory && document && project && (
        <Dialog
          title={document.name}
          wide
          onClose={() => {
            setShowHistory(false);
            history.replaceState(null, '', projectPath(project.id));
          }}
        >
          <div className="wb-upload-body">
            <div className="wb-history-heading">
              <span>上传记录 · {document.revisions.length}</span>
              {mayUpload && (
                <button
                  onClick={() => {
                    setShowHistory(false);
                    beginUpload(document.id);
                  }}
                >
                  <Upload size={14} />
                  上传新稿
                </button>
              )}
            </div>
            {document.revisions.map((r: any) => (
              <div className="team-revision" key={r.id}>
                <span className="revision-number">r{r.seq}</span>
                <div>
                  <b>{r.note || r.filename}</b>
                  <small>
                    {r.username} · {size(r.size)} · {new Date(r.created).toLocaleString('zh-CN')}
                  </small>
                  <p>{r.error || (r.status === 'ready' ? '' : r.step) || label(r.status)}</p>
                </div>
                <div className="revision-actions">
                  <span className={`team-status ${r.status}`}>
                    {r.id === document.current_revision ? '当前稿' : label(r.status)}
                  </span>
                  {r.status === 'ready' ? (
                    <>
                      <a href={revisionPath(project.id, document.id, r.id)}>
                        打开设计 <ArrowUpRight size={12} />
                      </a>
                      <button onClick={() => copyLink(r.id)}>
                        <Link size={12} />
                        复制链接
                      </button>
                      {r.id !== document.current_revision && mayUpload && (
                        <button onClick={() => makeCurrent(r.id)}>设为当前稿</button>
                      )}
                    </>
                  ) : r.status === 'failed' && mayUpload ? (
                    <button onClick={() => retry(r.id)}>重新处理</button>
                  ) : (
                    <button onClick={() => loadDocument(document.id, true)}>刷新状态</button>
                  )}
                </div>
              </div>
            ))}
            {alert}
          </div>
        </Dialog>
      )}
      {(active || phase === 'done') && !showUpload && (
        <button className="wb-transfer-pill" onClick={() => setShowUpload(true)}>
          {phase === 'done' ? (
            <CircleCheck size={18} />
          ) : (
            <LoaderCircle size={18} className={phase === 'paused' ? '' : 'wb-spin'} />
          )}
          <span>{uploadLabel}</span>
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
