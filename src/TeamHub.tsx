import { TeamFonts } from './TeamFonts';
import { TeamInviteDialog } from './TeamInviteDialog';
import { Logo } from './Logo';
import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { useDesignUpload } from './workspace/useDesignUpload';
import { UploadDialog } from './workspace/UploadDialog';
import { DesignList } from './workspace/DesignList';
import { api, post } from './api';
import './team.css';
import './workbench.css';
import './team-tree.css';
import './theme.css';
import './management.css';
import { TeamTree } from './TeamTree';
import { SpaceSwitcher } from './SpaceSwitcher';
import { SpaceToolbar } from './SpaceToolbar';
import { TeamOverview } from './TeamOverview';
import {
  Folder,
  Plus,
  FolderPlus,
  FileUp,
  ChevronRight,
  LayoutGrid,
  List,
  Monitor,
  ArrowUpRight,
  X,
  LoaderCircle,
  CircleCheck,
  Ellipsis,
  Menu,
} from 'lucide-react';
import { Dialog } from './Dialog';
import { ContextMenu, type MenuPosition } from './ContextMenu';
import { Trash2, Pencil, FolderInput } from 'lucide-react';
import {
  preferredSpace,
  rememberSpace,
  migratePreferences,
  sortDesigns,
  workspaceView,
  rememberWorkspaceView,
  type DesignSort,
} from './workbench';
import { AccountScreen } from './AccountScreen';
import { InviteScreen } from './InviteScreen';
import { TeamMembers } from './TeamMembers';
import { Choice } from './Choice';
import { routeFor, folderPath, designPath, spacePath, matchesId } from './routes';
import { setPageTitle } from './title';
import { visit } from './visit';
import { SortMenu } from './SortMenu';

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
  const [folderMenu, setFolderMenu] = useState<MenuPosition | null>(null);
  const [pageMenu, setPageMenu] = useState<MenuPosition | null>(null);
  const [inviteSpace, setInviteSpace] = useState<any>(null),
    [membersOpen, setMembersOpen] = useState(false),
    [linkOpen, setLinkOpen] = useState(false);
  const [sort, setSort] = useState<DesignSort>('updated');
  const [editing, setEditing] = useState<{
      kind: 'space' | 'folder' | 'design';
      item: any;
      move: boolean;
    } | null>(null),
    [editName, setEditName] = useState(''),
    [moveFolderId, setMoveFolderId] = useState(''),
    [savingEdit, setSavingEdit] = useState(false),
    [editError, setEditError] = useState('');
  const [deletion, setDeletion] = useState<{
      kind: 'space' | 'folder' | 'design';
      item: any;
    } | null>(null),
    [deleting, setDeleting] = useState(false),
    [deleteError, setDeleteError] = useState(''),
    [fileMenu, setFileMenu] = useState<(MenuPosition & { item: any }) | null>(null);
  const route = routeFor(location.pathname, location.search);
  const [navigationEpoch, setNavigationEpoch] = useState(0);
  const seenSpace = useRef<string | null>(null);
  useEffect(() => {
    const update = () => setNavigationEpoch((v) => v + 1);
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        e.defaultPrevented ||
        e.button !== 0 ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey
      )
        return;
      const anchor = (e.target as Element | null)?.closest?.('a');
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.origin);
      if (url.origin !== location.origin) return;
      const next = routeFor(url.pathname, url.search);
      if (next.kind !== 'space' || next.auth || next.inviteToken) return;
      e.preventDefault();
      visit(url.pathname + url.search);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  const [createFolderSpaceId, setCreateFolderSpaceId] = useState('');
  const [createFolderParentId, setCreateFolderParentId] = useState('');
  const [spaceLoaded, setSpaceLoaded] = useState(false),
    [designsLoaded, setDesignsLoaded] = useState(false),
    [files, setFiles] = useState<any[]>([]),
    [createKind, setCreateKind] = useState<'space' | 'folder' | null>(null),
    [creatingFolder, setCreatingFolder] = useState(false),
    [listView, setListView] = useState(false);
  const [loaded, setLoaded] = useState(false),
    [spaces, setSpaces] = useState<any[]>([]),
    [space, setSpace] = useState<any>(null),
    [newSpace, setNewSpace] = useState(''),
    [creatingSpace, setCreatingSpace] = useState(false);
  const [me, setMe] = useState<any>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const [folders, setFolders] = useState<any[]>([]),
    [folder, setFolder] = useState<any>(null),
    [designs, setDesigns] = useState<any[]>([]),
    [newFolder, setNewFolder] = useState('');
  useEffect(() => {
    if (!spaceLoaded || !me) return;
    const requested = route.folderId ? folders.find((f) => matchesId(route.folderId, f)) : null;
    if (route.folderId && !requested) {
      setError('文件夹不存在或无权访问');
      return;
    }
    const id = route.spaceId || requested?.space_id;
    if (!id) return;
    const selected = spaces.find((s) => matchesId(id, s));
    if (!selected) {
      setError('空间不存在或无权访问');
      return;
    }
    setSpace((current: any) => (current?.id === selected.id ? current : selected));
    setFolder((current: any) =>
      (current?.id || null) === (requested?.id || null) ? current : requested || null,
    );
    rememberSpace(me.id, selected.id);
  }, [navigationEpoch, spaceLoaded]);
  useEffect(() => {
    if (!loaded) {
      setPageTitle();
      return;
    }
    if (route.auth === 'register') {
      setPageTitle('注册');
      return;
    }
    if (route.auth === 'login' || route.inviteToken || !me) {
      setPageTitle(route.inviteToken ? '邀请' : '登录');
      return;
    }
    if (route.section === 'resources') {
      setPageTitle('资源');
      return;
    }
    const currentFolder = route.folderId
      ? folders.find((item) => matchesId(route.folderId, item))
      : null;
    setPageTitle(currentFolder?.name || space?.name);
  }, [
    loaded,
    me,
    route.auth,
    route.inviteToken,
    route.section,
    route.folderId,
    route.spaceId,
    folders,
    space?.name,
    navigationEpoch,
  ]);
  const upload = useDesignUpload({
    spaceId: space?.id,
    folderId: folder?.id,
    loadDesigns,
    loadDesign,
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
  const mayUpload = !!me && !!space;
  const canManageFolder = !!me && space?.role === 'owner';
  function requestDelete(kind: 'space' | 'folder' | 'design', item: any) {
    setDeleteError('');
    setDeletion({ kind, item });
  }
  function canDeleteFile(d: any) {
    return d.created_by === me?.id || space?.role === 'owner';
  }
  async function removeItem() {
    if (!deletion || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await api(
        `/${deletion.kind === 'space' ? 'spaces' : deletion.kind === 'folder' ? 'folders' : 'designs'}/${deletion.item.id}`,
        { method: 'DELETE' },
      );
      if (deletion.kind === 'space') {
        location.assign('/spaces');
        return;
      }
      if (deletion.kind === 'folder') {
        const parentId = deletion.item.parent_id;
        location.assign(
          parentId
            ? folderPath(parentId)
            : spacePath(deletion.item.space_id || space?.id),
        );
        return;
      }
      if (folder) await loadDesigns();
      else if (space) setFiles(await api(`/spaces/${space.id}/designs`));
      setDeletion(null);
      setNotice('设计已删除');
    } catch (e) {
      setDeleteError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  function moveOptions(d: any) {
    const sourceId = d.folder_id || null;
    const spaceId =
      d.space_id ||
      folders.find((f) => f.id === sourceId)?.space_id ||
      space?.id;
    const opts: { id: string; name: string }[] = [];
    if (sourceId) opts.push({ id: '', name: '空间根' });
    for (const f of folders.filter((x) => x.space_id === spaceId && x.id !== sourceId))
      opts.push({
        id: f.id,
        name: folderAncestors(f)
          .map((item) => item.name)
          .join(' / '),
      });
    return opts;
  }
  function requestEdit(kind: 'space' | 'folder' | 'design', item: any, move = false) {
    setEditName(item.name);
    setMoveFolderId(move ? moveOptions(item)[0]?.id ?? '' : '');
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
      if (move) await post(`/designs/${item.id}/move`, { folderId: moveFolderId || null });
      else
        await api(
          `/${kind === 'space' ? 'spaces' : kind === 'folder' ? 'folders' : 'designs'}/${item.id}`,
          { method: 'PATCH', body: JSON.stringify({ name: editName }) },
        );
      await loadSpaces();
      if (folder) await loadDesigns();
      else if (space) await loadDesigns();
      if (move && target === item.id) setTarget('');
      setEditing(null);
      setNotice(move ? '设计已移动' : '名称已更新');
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
  async function loadSpaces() {
    const allSpaces = await api<any[]>('/spaces');
    setSpaces(allSpaces);
    if (route.auth || route.inviteToken) return;
    const folderLists = await Promise.all(
      allSpaces.map(async (s) => {
        const list = await api<any[]>(`/spaces/${s.id}/folders`);
        return list.map((f) => ({ ...f, space_id: f.space_id || s.id }));
      }),
    );
    const allFolders = folderLists.flat();
    setFolders(allFolders);

    const requested = route.folderId
      ? allFolders.find((f) => matchesId(route.folderId, f))
      : null;
    if (route.folderId && !requested) throw new Error('文件夹不存在或无权访问');

    const id =
      route.spaceId || requested?.space_id || preferredSpace(me.id, allSpaces);
    const selected = allSpaces.find((s) => matchesId(id, s));
    if (id && !selected) throw new Error('空间不存在或无权访问');
    setSpace(selected || null);
    setFolder(requested || null);
    if (selected) {
      rememberSpace(me.id, selected.id);
      setFiles(await api(`/spaces/${selected.id}/designs`));
      if (!requested)
        history.replaceState(
          null,
          '',
          spacePath(selected.id) +
            (route.section === 'resources' ? '/resources' : '') +
            location.search,
        );
      else {
        const canonical = folderPath(requested.id) + location.search;
        if (location.pathname + location.search !== canonical)
          history.replaceState(null, '', canonical);
      }
    }
  }
  async function loadDesigns(id = folder?.id) {
    setDesignsLoaded(false);
    try {
      if (id) {
        const list = await api(`/folders/${id}/designs`);
        setDesigns(list);
      }
      if (space) setFiles(await api(`/spaces/${space.id}/designs`));
    } finally {
      setDesignsLoaded(true);
    }
  }
  async function loadDesign(id: string) {
    try {
      const d = await api(`/designs/${id}`);
      if (folder && d.folder_id !== folder.id) throw new Error('设计不属于当前文件夹');
      if (!folder && space && d.space_id !== space.id) throw new Error('设计不属于当前空间');
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
      loadSpaces()
        .catch((e) => setError(e.message))
        .finally(() => setSpaceLoaded(true));
  }, [me]);
  useEffect(() => {
    setTarget('');
    if (folder) {
      loadDesigns(folder.id).catch((e) => setError(e.message));
      history.replaceState(null, '', folderPath(folder.id));
    } else if (space) {
      if (seenSpace.current && seenSpace.current !== space.id)
        api(`/spaces/${space.id}/designs`)
          .then(setFiles)
          .catch((e) => setError((e as Error).message));
      seenSpace.current = space.id;
      setDesignsLoaded(true);
    }
  }, [folder?.id, space?.id]);
  async function createSpace(e: FormEvent) {
    e.preventDefault();
    if (creatingSpace) return;
    setCreatingSpace(true);
    setError('');
    try {
      const t = await post('/spaces', { name: newSpace });
      location.assign(spacePath(t.id));
    } catch (e) {
      setError((e as Error).message);
      setCreatingSpace(false);
    }
  }
  function folderAncestors(target: any) {
    const chain: any[] = [];
    const seen = new Set<string>();
    let current = target;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      chain.unshift(current);
      current = current.parent_id
        ? folders.find((item) => item.id === current.parent_id)
        : null;
    }
    return chain;
  }
  function openCreateFolder(spaceId = space?.id, parentId = '') {
    setCreateFolderSpaceId(spaceId || '');
    setCreateFolderParentId(parentId || '');
    setNewFolder('');
    setError('');
    setCreateKind('folder');
  }
  async function createFolder(e: FormEvent) {
    e.preventDefault();
    if (creatingFolder) return;
    setCreatingFolder(true);
    setError('');
    try {
      const p = await post('/folders', {
        spaceId: createFolderSpaceId || space.id,
        name: newFolder,
        ...(createFolderParentId ? { parentId: createFolderParentId } : {}),
      });
      setFolders((list) => [{ ...p, created: Date.now() }, ...list]);
      setNewFolder('');
      setCreateKind(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreatingFolder(false);
    }
  }
  async function copySpaceLink() {
    if (!space) return;
    const link = `${location.origin}${spacePath(space.id)}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('链接已复制');
    } catch {
      setError(`复制失败，请手动复制：${link}`);
    }
  }
  async function copyLink(designId: string) {
    const item = designs.find((d) => d.id === designId) || files.find((d) => d.id === designId);
    const sid = item?.space_id || space?.id;
    if (!sid) return;
    const link = `${location.origin}${designPath(sid, designId)}`;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('链接已复制');
    } catch {
      setError(`复制失败，请手动复制：${link}`);
    }
  }
  const workspaceReady = loaded && (!me || !!route.auth || !!route.inviteToken || spaceLoaded);
  const rootDesigns = files.filter((d) => !d.folder_id);
  const visibleFiles = sortDesigns(folder ? designs : rootDesigns, sort);
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
        <a className="brand brand-link" href="/spaces">
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
  const emptyFolder = designsLoaded && !(folder ? designs.length : rootDesigns.length);
  const spaceFolders = folders.filter((f) => f.space_id === space?.id && !f.parent_id);
  const childFolders = folder ? folders.filter((f) => f.parent_id === folder.id) : [];
  const listedFolders = folder ? childFolders : spaceFolders;
  const pageControls =
    listedFolders.length || visibleFiles.length ? (
      <div className="wb-page-controls">
        {visibleFiles.length > 0 && <SortMenu value={sort} onChange={changeSort} />}
        <div className="wb-view-switch" role="group" aria-label="展示方式">
          <button aria-label="网格视图" aria-pressed={!listView} onClick={() => changeView(false)}>
            <LayoutGrid size={16} />
          </button>
          <button aria-label="列表视图" aria-pressed={listView} onClick={() => changeView(true)}>
            <List size={16} />
          </button>
        </div>
      </div>
    ) : null;
  function onPageContextMenu(event: MouseEvent) {
    if (!space || route.section === 'resources') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (
      target.closest(
        'a, button, input, textarea, select, summary, .wb-file-card, .management-project-card, .gd-context-menu, .wb-create-menu',
      )
    )
      return;
    event.preventDefault();
    setPageMenu({ x: event.clientX, y: event.clientY });
  }
  return (
    <div className={`team-app wb-app${sidebarOpen ? ' navigation-open' : ''}`}>
      <aside
        ref={sidebarRef}
        id="management-sidebar"
        className="wb-sidebar"
        inert={narrow && !sidebarOpen}
        aria-hidden={narrow && !sidebarOpen ? true : undefined}
      >
        <SpaceSwitcher
          userId={me.id}
          username={me.username}
          spaces={spaces}
          value={space?.id}
          busy={active}
          onCreate={() => {
            setError('');
            setNewSpace('');
            setCreateKind('space');
          }}
          onLogout={() => {
            void post('/logout')
              .then(() => location.assign('/login'))
              .catch((e) => setError((e as Error).message));
          }}
        />
        <TeamTree spaceId={space?.id} section={folder ? undefined : route.section} />
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
        </header>

        <main className="wb-content" onContextMenu={onPageContextMenu}>
          {alert}
          {notice && (
            <div className="wb-toast" role="status">
              {notice}
            </div>
          )}
          {!workspaceReady ? (
            <div className="wb-loading">
              <LoaderCircle size={22} className="wb-spin" />
              正在打开工作台…
            </div>
          ) : space && !folder && route.section === 'resources' ? (
            <div className="wb-resources">
              <TeamFonts key={space.id} team={space} />
            </div>
          ) : space && !folder ? (
            <>
              <SpaceToolbar
                spaceName={space.name}
                mark={
                  Array.from(space.kind === 'personal' ? me.username : space.name)[0]?.toUpperCase() ||
                  '空'
                }
                canInvite={space.kind !== 'personal' && space.role === 'owner'}
                canRename={space.kind !== 'personal' && space.role === 'owner'}
                canDelete={space.kind !== 'personal' && space.role === 'owner'}
                canManageMembers={space.kind !== 'personal'}
                canUpload={mayUpload}
                onInvite={() => setInviteSpace(space)}
                onMembers={() => setMembersOpen(true)}
                onCreateFolder={() => openCreateFolder(space.id)}
                onUpload={() => beginUpload()}
                onRename={() => requestEdit('space', space)}
                onCopy={() => setLinkOpen(true)}
                onDelete={() => requestDelete('space', space)}
                controls={pageControls}
              />
              <TeamOverview
                team={space}
                folders={spaceFolders}
                files={files}
                listView={listView}
                onCreateFolder={() => openCreateFolder(space.id)}
                onRename={(kind, item) => requestEdit(kind, item)}
                onDelete={requestDelete}
              />
              {!(spaceFolders.length && emptyFolder) && (
                <DesignList
                  spaceId={space.id}
                  folder={null}
                  emptyFolder={!!emptyFolder && !spaceFolders.length}
                  designsLoaded={designsLoaded}
                  visibleFiles={visibleFiles}
                  listView={listView}
                  mayUpload={mayUpload}
                  active={active}
                  beginUpload={beginUpload}
                  setFileMenu={setFileMenu}
                  copyLink={copyLink}
                  canDeleteFile={canDeleteFile}
                  canMoveFile={(d) => !!moveOptions(d).length}
                  requestEdit={requestEdit}
                  requestDelete={requestDelete}
                />
              )}
              {space.kind !== 'personal' && membersOpen && (
                <Dialog
                  wide
                  title="成员"
                  onClose={() => setMembersOpen(false)}
                >
                  <div className="wb-upload-body">
                    <TeamMembers key={space.id} team={space} me={me} />
                  </div>
                </Dialog>
              )}
            </>
          ) : !space ? (
            <div className="wb-onboarding">
              <div className="wb-onboarding-art">
                <Folder size={62} strokeWidth={1} />
                <span>
                  <Plus size={18} />
                </span>
              </div>
              <h1>给设计一个共同的空间</h1>
              <p>
                创建协作空间，和伙伴一起查看、交付设计。
                <br />
                已经收到邀请？直接打开邀请链接即可。
              </p>
              <button
                className="primary"
                onClick={() => {
                  setError('');
                  setCreateKind('space');
                }}
              >
                <Plus size={16} />
                创建协作空间
              </button>
            </div>
          ) : (
            <>
              <div className="wb-folder-bar">
                <nav className="wb-breadcrumb" aria-label="所在位置">
                  <a href={spacePath(space.id)}>{space.name}</a>
                  {folderAncestors(folder).flatMap((item, index, chain) => [
                    <ChevronRight key={`${item.id}-sep`} size={14} aria-hidden="true" />,
                    index === chain.length - 1 ? (
                      <b key={item.id}>{item.name}</b>
                    ) : (
                      <a key={item.id} href={folderPath(item.id)}>
                        {item.name}
                      </a>
                    ),
                  ])}
                </nav>
                <SpaceToolbar
                  spaceName={folder?.name || '设计文件'}
                  mark=""
                  canInvite={false}
                  canRename={false}
                  canDelete={false}
                  canManageMembers={false}
                  canUpload={mayUpload}
                  identity={false}
                  onInvite={() => {}}
                  onMembers={() => {}}
                  onCreateFolder={() => openCreateFolder(space.id, folder.id)}
                  onUpload={() => beginUpload()}
                  onRename={() => {}}
                  onCopy={() => {}}
                  onDelete={() => {}}
                />
              </div>
              <div
                className="wb-page-heading project-page-heading"
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setFolderMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <div className="project-title-actions">
                  <h1>
                    <span className="wb-folder-mark" aria-hidden="true">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path d="M9 13h6" />
                        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
                      </svg>
                    </span>
                    <span>{folder?.name || '设计文件'}</span>
                  </h1>
                  <button
                    className="wb-icon-button"
                    aria-label="文件夹操作"
                    title="文件夹操作"
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setFolderMenu({ x: rect.left, y: rect.bottom + 6 });
                    }}
                  >
                    <Ellipsis size={18} />
                  </button>
                </div>
                {pageControls}
              </div>
              <TeamOverview
                team={space}
                folders={childFolders}
                files={files}
                listView={listView}
                onCreateFolder={() => openCreateFolder(space.id, folder.id)}
                onRename={(kind, item) => requestEdit(kind, item)}
                onDelete={requestDelete}
              />
              {!(childFolders.length && emptyFolder) && (
              <div>
                <DesignList
                  spaceId={space.id}
                  folder={folder}
                  emptyFolder={!!emptyFolder && !childFolders.length}
                  designsLoaded={designsLoaded}
                  visibleFiles={visibleFiles}
                  listView={listView}
                  mayUpload={mayUpload}
                  active={active}
                  beginUpload={beginUpload}
                  setFileMenu={setFileMenu}
                  copyLink={copyLink}
                  canDeleteFile={canDeleteFile}
                  canMoveFile={(d) => !!moveOptions(d).length}
                  requestEdit={requestEdit}
                  requestDelete={requestDelete}
                />
              </div>
              )}
            </>
          )}
        </main>
      </div>
      {pageMenu && space && (
        <ContextMenu position={pageMenu} onClose={() => setPageMenu(null)}>
          <button type="button" onClick={() => openCreateFolder(space.id, folder?.id || '')}>
            <FolderPlus size={16} />
            文件夹
          </button>
          <button type="button" disabled={!mayUpload} onClick={() => beginUpload()}>
            <FileUp size={16} />
            上传设计
          </button>
        </ContextMenu>
      )}
      {folderMenu && folder && (
        <ContextMenu position={folderMenu} onClose={() => setFolderMenu(null)}>
          <button disabled={active} onClick={() => requestEdit('folder', folder)}>
            <Pencil size={16} />
            重命名文件夹
          </button>
          {canManageFolder && (
            <button
              className="danger"
              disabled={active}
              onClick={() => requestDelete('folder', folder)}
            >
              <Trash2 size={16} />
              删除文件夹
            </button>
          )}
        </ContextMenu>
      )}
      {linkOpen && space && (
        <Dialog title="复制链接" onClose={() => setLinkOpen(false)}>
          <div className="wb-upload-body">
            <p className="wb-dialog-description">这是「{space.name}」的链接。</p>
            <div className="invite-copy">
              <input
                aria-label="空间链接"
                readOnly
                spellCheck={false}
                data-dialog-initial-focus
                value={`${location.origin}${spacePath(space.id)}`}
                onFocus={(e) => e.target.select()}
              />
            </div>
            <div className="wb-dialog-actions">
              <button type="button" onClick={() => setLinkOpen(false)}>
                关闭
              </button>
              <button className="primary" type="button" onClick={() => void copySpaceLink()}>
                复制
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {inviteSpace && (
        <TeamInviteDialog
          key={inviteSpace.id}
          team={inviteSpace}
          onClose={() => setInviteSpace(null)}
        />
      )}
      {editing && (
        <Dialog
          title={
            editing.move
              ? '移动设计'
              : `重命名${editing.kind === 'space' ? '空间' : editing.kind === 'folder' ? '文件夹' : '设计'}`
          }
          onClose={() => {
            if (!savingEdit) setEditing(null);
          }}
        >
          <form className="wb-upload-body" onSubmit={saveEdit}>
            {editing.move ? (
              <>
                <p className="wb-dialog-description">
                  将「{editing.item.name}」移动到同一空间的其他位置。
                </p>
                <Choice
                  label="目标位置"
                  value={moveFolderId}
                  onChange={setMoveFolderId}
                  disabled={savingEdit}
                  options={moveOptions(editing.item)}
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
                disabled={
                  savingEdit ||
                  (editing.move ? !moveOptions(editing.item).length : !editName.trim())
                }
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
              fileMenu.item.status === 'ready'
                ? designPath(fileMenu.item.space_id || space.id, fileMenu.item.id)
                : fileMenu.item.folder_id
                  ? folderPath(fileMenu.item.folder_id)
                  : spacePath(fileMenu.item.space_id || space.id)
            }
          >
            <ArrowUpRight size={16} />
            打开设计
          </a>
          {canDeleteFile(fileMenu.item) && (
            <>
              <button disabled={active} onClick={() => requestEdit('design', fileMenu.item)}>
                <Pencil size={16} />
                重命名设计
              </button>
              <button
                disabled={active || !moveOptions(fileMenu.item).length}
                onClick={() => requestEdit('design', fileMenu.item, true)}
              >
                <FolderInput size={16} />
                移动到文件夹
              </button>
            </>
          )}
          {canDeleteFile(fileMenu.item) && (
            <button
              className="danger"
              disabled={active}
              onClick={() => requestDelete('design', fileMenu.item)}
            >
              <Trash2 size={16} />
              删除设计
            </button>
          )}
        </ContextMenu>
      )}
      {deletion && (
        <Dialog
          title={`删除${deletion.kind === 'space' ? '空间' : deletion.kind === 'folder' ? '文件夹' : '设计'}`}
          onClose={() => {
            if (!deleting) setDeletion(null);
          }}
        >
          <div className="gd-delete-body">
            <p>
              确定删除「<strong>{deletion.item.name}</strong>」？
            </p>
            <p>
              {deletion.kind === 'space'
                ? '空间下的全部文件夹、设计和成员关系将一并删除。'
                : deletion.kind === 'folder'
                  ? '文件夹下的全部设计将一并删除。'
                  : '该设计将被删除。'}{' '}
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
          title={createKind === 'space' ? '创建协作空间' : '新建文件夹'}
          onClose={() => {
            if (!creatingSpace && !creatingFolder) setCreateKind(null);
          }}
        >
          <form
            className="wb-create-form"
            onSubmit={createKind === 'space' ? createSpace : createFolder}
          >
            <p>
              {createKind === 'space'
                ? '为协作空间取一个名字，之后就可以邀请伙伴加入。'
                : `创建在「${
                    folders.find((item) => item.id === createFolderParentId)?.name ||
                    spaces.find((t) => t.id === createFolderSpaceId)?.name ||
                    space?.name
                  }」中。`}
            </p>
            <label>
              {createKind === 'space' ? '空间名称' : '文件夹名称'}
              <input
                autoFocus
                data-dialog-initial-focus
                required
                maxLength={120}
                placeholder={createKind === 'space' ? '例如：产品设计协作' : '例如：移动端设计'}
                value={createKind === 'space' ? newSpace : newFolder}
                onChange={(e) =>
                  createKind === 'space' ? setNewSpace(e.target.value) : setNewFolder(e.target.value)
                }
              />
            </label>
            {alert}
            <div className="wb-dialog-actions">
              <button
                type="button"
                onClick={() => setCreateKind(null)}
                disabled={creatingSpace || creatingFolder}
              >
                取消
              </button>
              <button className="primary" disabled={creatingSpace || creatingFolder}>
                {creatingSpace || creatingFolder ? '正在创建…' : '创建'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {showUpload && space && (
        <UploadDialog
          upload={upload}
          spaceId={space.id}
          targetName={
            (folder ? designs : files).find((d) => d.id === target)?.name
          }
          alert={alert}
        />
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
