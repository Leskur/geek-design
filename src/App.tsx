import { api } from './api';
import { FontPanel } from './FontPanel';
import { UnifiedTree } from './UnifiedTree';
import { PageOverview } from './PageOverview';
import { SceneCache } from './SceneCache';
import type { Camera } from './interaction';
import { Logo } from './Logo';
import {
  ChevronRight,
  Plus,
  Frame,
  Download,
  Link,
  FileImage,
  SpellCheck2,
  Search,
  LoaderCircle,
} from 'lucide-react';
import React, {
  lazy,
  Suspense,
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { SketchDocument, type Layer, type DocumentSource } from './sketch';
import { Canvas } from './Canvas';
import { RemoteDocument } from './RemoteDocument';
import { TeamHub } from './TeamHub';
import { ViewerNavigation } from './ViewerNavigation';
import { DocumentOpening } from './DocumentOpening';
import { routeFor, localOnly, withBase, folderPath, spacePath } from './routes';
import { displayName, productLabel, setPageTitle } from './title';
import { detailEnabled } from './detail-entry';
import { PageList } from './PageList';
import { Inspector } from './Inspector';
import type { Scene } from '../shared/rendering/scene';
import {
  beginPanelResize,
  LEFT_PANEL_KEY,
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  readPanelWidth,
  RIGHT_PANEL_KEY,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_MIN,
} from './panel-resize';

import { fontNames } from '../shared/fonts';
import { hasFont } from './fonts';
import './style.css';
import './view-states.css';
import './actions.css';
import './inspector.css';
import './overview.css';
import './cursor.css';

const AIExport = lazy(() => import('./AIExport').then((m) => ({ default: m.AIExport })));
const SOURCE_REPO = 'https://github.com/Leskur/geek-design';
function GitHubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}
export function App() {
  const [zoomHost, setZoomHost] = useState<HTMLDivElement | null>(null);
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<DocumentSource | null>(null),
    [page, setPage] = useState<Layer | null>(null),
    [board, setBoard] = useState<Layer | null>(null),
    [selected, setSelected] = useState<Layer | null>(null),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [searchOpen, setSearchOpen] = useState(false),
    [pageExpanded, setPageExpanded] = useState(true),
    [layersExpanded, setLayersExpanded] = useState(true),
    [mode, setMode] = useState<'overview' | 'detail'>('overview'),
    [toast, setToast] = useState(''),
    [scene, setScene] = useState<Scene | null>(null),
    [leftWidth, setLeftWidth] = useState(() => readPanelWidth(LEFT_PANEL_KEY, 250)),
    [rightWidth, setRightWidth] = useState(() => readPanelWidth(RIGHT_PANEL_KEY, 300)),
    [canvasLeft, setCanvasLeft] = useState(() => readPanelWidth(LEFT_PANEL_KEY, 250)),
    [canvasRight, setCanvasRight] = useState(() => readPanelWidth(RIGHT_PANEL_KEY, 300));
  const input = useRef<HTMLInputElement>(null);
  const layerSearch = useRef<HTMLInputElement>(null);
  const loadId = useRef(0),
    pageId = useRef(0),
    current = useRef<DocumentSource | null>(null);
  const boards = page?.layers || [];
  const cache = useMemo(() => (doc ? new SceneCache(doc) : null), [doc]);
  useEffect(() => {
    setPageExpanded(true);
    setLayersExpanded(true);
  }, [doc]);
  useEffect(() => {
    if (searchOpen) layerSearch.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    if (!detailEnabled && mode === 'detail') setMode('overview');
  }, [mode]);
  // Defer scene expand so the first paint stays light.
  useEffect(() => {
    if (!board || !cache) {
      setScene(null);
      return;
    }
    setScene(null);
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      try {
        const next = cache.get(board);
        if (!cancelled) startTransition(() => setScene(next));
      } catch (e) {
        if (!cancelled) setError((e as Error).message || '无法解析画板');
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [board, cache]);
  const overviewSelection = useRef<{
    pageId: string;
    board: Layer | null;
    selected: Layer | null;
  } | null>(null);
  const cameras = useRef(new Map<string, Camera>());
  const [focus, setFocus] = useState<{ id: string; serial: number } | null>(null),
    [detailFocus, setDetailFocus] = useState<{ id: string; serial: number } | null>(null);
  const [showWarnings, setShowWarnings] = useState(false),
    [showExport, setShowExport] = useState(false);
  const [showFonts, setShowFonts] = useState(false),
    [fontEpoch, setFontEpoch] = useState(0),
    [fontTarget, setFontTarget] = useState(''),
    [fontStatus, setFontStatus] = useState('');
  const fontInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!doc || doc.source !== 'team' || doc.fontLibrary) return;
    const controller = new AbortController(),
      designId = routeFor(location.pathname, location.search).designId;
    if (!designId) return;
    void (async () => {
      try {
        const design = await api<{ space_id: string }>(`/designs/${encodeURIComponent(designId)}`, {
          signal: controller.signal,
        });
        const space = await api<{ id: string; role: string }>(
          `/spaces/${encodeURIComponent(design.space_id)}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        doc.fontLibrary = { spaceId: space.id, canUpload: space.role === 'owner' };
        setFontEpoch((v) => v + 1);
      } catch {
        /* Keep the font details available if space metadata cannot be fetched. */
      }
    })();
    return () => controller.abort();
  }, [doc]);

  useEffect(() => {
    const refresh = () => setFontEpoch((v) => v + 1);
    document.fonts.addEventListener('loadingdone', refresh);
    window.addEventListener('viewer-fonts-changed', refresh);
    return () => {
      document.fonts.removeEventListener('loadingdone', refresh);
      window.removeEventListener('viewer-fonts-changed', refresh);
    };
  }, []);
  const pageFonts = useMemo(() => fontNames(page, doc || undefined), [page, doc]);
  const fonts = useMemo(
    () => pageFonts.map((name) => ({ name, available: hasFont(name) })),
    [pageFonts, fontEpoch],
  );
  const missingFonts = fonts.filter((f) => !f.available).length;
  async function loadFont(file: File) {
    try {
      setFontStatus('正在加载字体…');
      const face = await new FontFace(fontTarget, await file.arrayBuffer()).load();
      document.fonts.add(face);
      setFontEpoch((v) => v + 1);
      setFontStatus(`已加载 ${file.name} → ${fontTarget}，仅在当前浏览器会话生效`);
    } catch {
      setFontStatus('字体加载失败，请选择有效的 TTF、OTF 或 WOFF 字体文件');
    }
  }
  function pickFont(name: string) {
    setFontTarget(name);
    fontInput.current?.click();
  }
  async function loadSource(next: DocumentSource) {
    const token = ++loadId.current;
    pageId.current++;
    setBusy(true);
    setError('');
      setStatus(next.source === 'team' ? '连接设计…' : '读取文件目录…');
    try {
      await next.open();
      setStatus('读取组件和页面…');
      await next.loadSymbols();
      const requested = new URLSearchParams(location.search),
        first = next.pages.find((x) => x.id === requested.get('page')) || next.pages[0];
      const p = await next.page(first.id);
      if (token !== loadId.current) {
        await next.close();
        return;
      }
      const old = current.current;
      current.current = next;
      setDoc(next);
      setPage(p);
      setBoard(
        p.layers?.find((x) => x.do_objectID === requested.get('artboard')) || p.layers?.[0] || null,
      );
      setSelected(null);
      setSearch('');
      setSearchOpen(false);
      cameras.current.clear();
      setFocus(null);
      setDetailFocus(null);
      setMode(detailEnabled && requested.has('artboard') ? 'detail' : 'overview');
      setStatus('');
      if (old) await old.close();
    } catch (e) {
      if (next.source === 'team' && (e as any).status === 401) {
        location.assign('/login?next=' + encodeURIComponent(location.pathname + location.search));
        return;
      }
      if (next !== current.current) await next.close();
      if (token === loadId.current) setError((e as Error).message);
    } finally {
      if (token === loadId.current) setBusy(false);
    }
  }
  async function open(file: File) {
    if (!file.name.toLowerCase().endsWith('.sketch')) {
      setError('请选择 .sketch 文件');
      return;
    }
    history.replaceState(null, '', withBase(localOnly ? '/' : '/local'));
    await loadSource(new SketchDocument(file));
  }
  useEffect(() => {
    const route = routeFor(location.pathname, location.search);
    const id = route.designId;
    if (id) void loadSource(new RemoteDocument(id));
  }, []);
  function viewerURL(pageId: string, boardId?: string) {
    const url = new URL(location.href);
    url.searchParams.set('page', pageId);
    if (boardId) url.searchParams.set('artboard', boardId);
    else url.searchParams.delete('artboard');
    return url.pathname + url.search;
  }
  function recordBoard(b: Layer) {
    if (!page) return;
    if (mode === 'overview') {
      history.replaceState({ ...history.state, viewer: true }, '', viewerURL(page.do_objectID));
      history.pushState(
        { viewer: true, fromOverview: true },
        '',
        viewerURL(page.do_objectID, b.do_objectID),
      );
    } else history.replaceState(history.state, '', viewerURL(page.do_objectID, b.do_objectID));
  }
  function returnOverview() {
    if (history.state?.fromOverview) {
      history.back();
      return;
    }
    if (page) history.replaceState({ viewer: true }, '', viewerURL(page.do_objectID));
    setMode('overview');
    const saved = overviewSelection.current;
    if (saved && saved.pageId === page?.do_objectID) {
      setBoard(saved.board);
      setSelected(saved.selected);
    } else setSelected(board);
    setFocus(null);
    setDetailFocus(null);
  }
  useEffect(() => {
    if (!doc) return;
    let disposed = false;
    async function restore() {
      const token = ++pageId.current;
      const params = new URLSearchParams(location.search),
        id = params.get('page') || page?.do_objectID;
      if (!id) return;
      setShowExport(false);
      setShowFonts(false);
      setError('');
      setBusy(true);
      try {
        const p = await doc!.page(id);
        if (disposed || token !== pageId.current) return;
        const b =
          p.layers?.find((x) => x.do_objectID === params.get('artboard')) || p.layers?.[0] || null;
        const saved =
          !params.get('artboard') && overviewSelection.current?.pageId === p.do_objectID
            ? overviewSelection.current
            : null;
        setPage(p);
        setBoard(saved ? saved.board : b);
        setSelected(saved ? saved.selected : null);
        setSearch('');
        setSearchOpen(false);
        setFocus(null);
        setDetailFocus(null);
        setMode(detailEnabled && params.get('artboard') && b ? 'detail' : 'overview');
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      } finally {
        if (token === pageId.current) setBusy(false);
      }
    }
    const listener = () => {
      void restore();
    };
    window.addEventListener('popstate', listener);
    return () => {
      disposed = true;
      window.removeEventListener('popstate', listener);
    };
  }, [doc, page?.do_objectID]);
  async function changePage(id: string) {
    if (!doc) return;
    const token = ++pageId.current;
    setBusy(true);
    setError('');
    try {
      const p = await doc.page(id);
      if (token !== pageId.current) return;
      history.replaceState({ viewer: true }, '', viewerURL(id));
      setPage(p);
      setBoard(p.layers?.[0] || null);
      setSelected(null);
      setSearch('');
      setSearchOpen(false);
      setMode('overview');
      setFocus(null);
      setDetailFocus(null);
    } catch (e) {
      setError(String(e));
    } finally {
      if (token === pageId.current) setBusy(false);
    }
  }
  const choose = useCallback((l: Layer | null) => setSelected(l), []);
  function selectBoard(b: Layer | null) {
    setBoard(b);
    setSelected(b);
  }
  function openBoard(b: Layer) {
    if (!detailEnabled) return;
    if (mode === 'overview' && page)
      overviewSelection.current = { pageId: page.do_objectID, board, selected };
    recordBoard(b);
    setFocus(null);
    setBoard(b);
    setSelected(null);
    setMode('detail');
    setDetailFocus(null);
  }
  function navigateBoard(b: Layer) {
    selectBoard(b);
    if (mode === 'overview')
      setFocus((old) => ({ id: b.do_objectID, serial: (old?.serial || 0) + 1 }));
    else {
      recordBoard(b);
      setDetailFocus((old) => ({ id: b.do_objectID, serial: (old?.serial || 0) + 1 }));
    }
  }
  function navigateLayer(b: Layer, l: Layer) {
    if (mode === 'overview') {
      setBoard(b);
      setSelected(l);
      setFocus((old) => ({ id: l.do_objectID, serial: (old?.serial || 0) + 1 }));
      return;
    }
    if (!detailEnabled) {
      setBoard(b);
      setSelected(l);
      setFocus((old) => ({ id: l.do_objectID, serial: (old?.serial || 0) + 1 }));
      return;
    }
    recordBoard(b);
    setFocus(null);
    setBoard(b);
    setSelected(l);
    setMode('detail');
    setDetailFocus((old) => ({ id: l.do_objectID, serial: (old?.serial || 0) + 1 }));
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setToast('已复制');
      setTimeout(() => setToast(''), 1500);
    } catch {
      setToast('复制失败，请手动选择文本');
    }
  }
  const route = routeFor(location.pathname, location.search);
  useEffect(() => {
    if (route.kind === 'space' && !localOnly) return;
    if (localOnly && (route.kind === 'space' || route.kind === 'design')) {
      setPageTitle('本地文件');
      return;
    }
    if (route.kind === 'missing') {
      setPageTitle('页面不存在');
      return;
    }
    if (route.kind === 'local') {
      setPageTitle(doc?.source === 'local' ? displayName(doc.file.name) : '本地文件');
      return;
    }
    setPageTitle(doc?.place?.name || (doc?.source === 'local' ? displayName(doc.file.name) : undefined));
  }, [route.kind, route.designId, doc]);
  if (localOnly && (route.kind === 'space' || route.kind === 'design'))
    return (
      <main className="welcome missing-page">
        <h1>此站点仅支持本地查看</h1>
        <p>空间与在线稿件功能请使用完整部署。</p>
        <a className="button-link" href={withBase('/')}>
          打开本地文件
        </a>
      </main>
    );
  if (route.kind === 'space') return <TeamHub />;
  if (route.kind === 'missing')
    return (
      <main className="welcome missing-page">
        <h1>页面不存在</h1>
        <a className="button-link" href={withBase(localOnly ? '/' : '/spaces')}>
          {localOnly ? '打开本地文件' : '返回工作台'}
        </a>
      </main>
    );
  if (route.kind === 'design' && !doc)
    return (
      <DocumentOpening
        folderId={route.folderId}
        spaceId={route.spaceId}
        status={status}
        error={error}
        onRetry={() => void loadSource(new RemoteDocument(route.designId!))}
      />
    );
  return (
    <div
      className="app"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (doc) return;
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.sketch')) void open(file);
      }}
    >
      {doc && (
        <header className="viewer-header">
          <div className="viewer-header-leading">
            <div className="viewer-document-nav">
              <ViewerNavigation
                folderId={doc.place?.folders.at(-1)?.id || route.folderId}
                spaceId={doc.place?.space.id || route.spaceId}
                detail={mode === 'detail'}
                onOverview={returnOverview}
              />
            </div>
            <nav className="viewer-path" aria-label="文件路径">
              {doc.place ? (
                <>
                  <a href={withBase(spacePath(doc.place.space.id))}>{doc.place.space.name}</a>
                  {doc.place.folders.map((item) => (
                    <span className="viewer-path-part" key={item.id}>
                      <span className="viewer-path-sep" aria-hidden="true">
                        /
                      </span>
                      <a href={withBase(folderPath(item.id))}>{item.name}</a>
                    </span>
                  ))}
                  <span className="viewer-path-part">
                    <span className="viewer-path-sep" aria-hidden="true">
                      /
                    </span>
                    <b>{doc.place.name}</b>
                  </span>
                </>
              ) : (
                <b>{displayName(doc.file.name)}</b>
              )}
            </nav>
          </div>
          <div className="viewer-toolbar" ref={setToolbarHost} />
          <div className="viewer-header-actions">
            {missingFonts > 0 && (
              <button
                className="viewer-font-warning"
                title={`当前页面缺少 ${missingFonts} 种字体，点击查看`}
                aria-label={`当前页面缺少 ${missingFonts} 种字体，查看详情`}
                onClick={() => setShowFonts(true)}
              >
                <SpellCheck2 size={18} strokeWidth={1.6} aria-hidden="true" />
              </button>
            )}
            {doc?.source === 'team' && (
              <button
                className="viewer-copy"
                title="复制分享链接"
                aria-label="复制分享链接"
                onClick={() =>
                  copy(
                    location.origin +
                      viewerURL(
                        page?.do_objectID || '',
                        mode === 'detail' ? board?.do_objectID : undefined,
                      ),
                  )
                }
              >
                <Link size={16} />
                分享
              </button>
            )}
            {doc && board && (
              <button
                className="header-export primary"
                title="导出给 AI"
                aria-label="AI 导出"
                onClick={() => setShowExport(true)}
              >
                <Download size={16} />
                AI 导出
              </button>
            )}
            {(localOnly || doc.source === 'local') && (
              <a
                className="viewer-github"
                href={SOURCE_REPO}
                target="_blank"
                rel="noopener noreferrer"
                title="GeekDesign 主仓库"
                aria-label="在 GitHub 打开主仓库"
              >
                <GitHubIcon />
                <span>GitHub</span>
              </a>
            )}
            <div className="viewer-zoom" ref={setZoomHost} />
          </div>
        </header>
      )}
      <input
        ref={fontInput}
        hidden
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        onChange={(e) => {
          if (e.target.files?.[0]) loadFont(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={input}
        hidden
        type="file"
        accept=".sketch"
        onChange={(e) => {
          if (e.target.files?.[0]) open(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {!doc ? (
        <main className="welcome local-landing">
          <a
            className="local-github"
            href={SOURCE_REPO}
            target="_blank"
            rel="noopener noreferrer"
            title="在 GitHub 打开"
            aria-label={`在 GitHub 打开 ${productLabel}`}
          >
            <GitHubIcon />
            {productLabel}
          </a>
          <a
            className="brand brand-link"
            href={withBase(localOnly ? '/' : '/spaces')}
            aria-label={localOnly ? 'GeekDesign 本地查看' : 'GeekDesign 工作台'}
          >
            <Logo size={32} />
            Geek<span>Design</span>
          </a>
          <h1>打开本地 Sketch</h1>
          <p>文件仅在当前浏览器处理</p>
          <button className="drop" disabled={busy} onClick={() => input.current?.click()}>
            <FileImage size={44} strokeWidth={1.4} />
            <b>{busy ? '正在解析文件…' : '将 .sketch 文件拖到这里'}</b>
            <span>或点击选择本地文件 · 无需上传</span>
          </button>
          {localOnly && (
            <>
              <div className="local-demo-actions">
                <button
                  type="button"
                  className="local-demo-open"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      try {
                        const response = await fetch(withBase('/examples/geekdesign-demo.sketch'));
                        if (!response.ok) throw new Error('示例文件不可用');
                        const blob = await response.blob();
                        await open(
                          new File([blob], 'geekdesign-demo.sketch', {
                            type: 'application/octet-stream',
                          }),
                        );
                      } catch (e) {
                        setError((e as Error).message || '打开示例失败');
                      }
                    })();
                  }}
                >
                  打开示例文件
                </button>
                <a
                  className="local-demo-download"
                  href={withBase('/examples/geekdesign-demo.sketch')}
                  download="geekdesign-demo.sketch"
                >
                  下载示例
                </a>
              </div>
              <p className="local-demo-note">示例为自制演示稿，不含真实业务内容</p>
            </>
          )}
          {!localOnly && (
            <a className="local-return" href={withBase('/spaces')}>
              返回工作台
            </a>
          )}
        </main>
      ) : (
        <div
          className="workspace viewer-workspace"
          style={
            {
              '--viewer-left-width': `${leftWidth}px`,
              '--viewer-right-width': `${rightWidth}px`,
              '--canvas-left-inset': `${canvasLeft}px`,
              '--canvas-right-inset': `${canvasRight}px`,
            } as React.CSSProperties
          }
        >
          <aside className="left">
            <button
              type="button"
              className="navigation-section-title page-section-toggle"
              aria-expanded={pageExpanded}
              aria-label={pageExpanded ? '收起页面' : '展开页面'}
              onClick={() => setPageExpanded((open) => !open)}
            >
              <ChevronRight
                size={12}
                style={{ transform: pageExpanded ? 'rotate(90deg)' : undefined }}
              />
              <span>页面</span>
            </button>
            {pageExpanded && (
              <PageList
                pages={doc.pages}
                value={page?.do_objectID || ''}
                disabled={busy}
                onChange={changePage}
                onReselect={returnOverview}
              />
            )}
            <div className="layers-head">
              <button
                type="button"
                className="navigation-section-title page-section-toggle layers-heading"
                aria-expanded={layersExpanded}
                aria-label={layersExpanded ? '收起图层' : '展开图层'}
                onClick={() => setLayersExpanded((open) => !open)}
              >
                <ChevronRight
                  size={12}
                  style={{ transform: layersExpanded ? 'rotate(90deg)' : undefined }}
                />
                <span>图层</span>
              </button>
              <button
                type="button"
                className="layer-search-toggle"
                aria-pressed={searchOpen}
                aria-label={searchOpen ? '关闭搜索' : '搜索图层'}
                onClick={() => {
                  if (searchOpen) {
                    setSearch('');
                    setSearchOpen(false);
                    return;
                  }
                  setLayersExpanded(true);
                  setSearchOpen(true);
                }}
              >
                <Search size={14} strokeWidth={1.8} />
              </button>
            </div>
            {layersExpanded && (
              <>
                {searchOpen && (
                  <input
                    ref={layerSearch}
                    className="search"
                    aria-label="搜索图层"
                    placeholder="搜索图层…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Escape') return;
                      setSearch('');
                      setSearchOpen(false);
                    }}
                  />
                )}
                {cache && (
                  <UnifiedTree
                    boards={boards}
                    cache={cache}
                    activeBoardId={board?.do_objectID}
                    selected={selected}
                    search={search}
                    onBoard={navigateBoard}
                    onLayer={navigateLayer}
                  />
                )}
              </>
            )}
            <button
              type="button"
              className="viewer-panel-resize viewer-panel-resize-end"
              aria-label="调整导航栏宽度"
              title="拖动调整宽度"
              onPointerDown={(e) =>
                beginPanelResize(e, {
                  startWidth: leftWidth,
                  otherWidth: selected ? RIGHT_PANEL_MIN : 0,
                  min: LEFT_PANEL_MIN,
                  max: LEFT_PANEL_MAX,
                  direction: 1,
                  onBegin: () => {
                    flushSync(() => {
                      setCanvasLeft(LEFT_PANEL_MIN);
                      setCanvasRight(selected ? RIGHT_PANEL_MIN : 0);
                    });
                  },
                  onChange: setLeftWidth,
                  onCommit: (width) => {
                    flushSync(() => {
                      setLeftWidth(width);
                      setCanvasLeft(width);
                      setCanvasRight(selected ? rightWidth : 0);
                    });
                  },
                  storageKey: LEFT_PANEL_KEY,
                })
              }
            />
          </aside>
          {mode === 'overview' && page && cache ? (
            <PageOverview
              toolbarHost={toolbarHost}
              zoomHost={zoomHost}
              boards={boards}
              pageId={page.do_objectID}
              pageName={page.name}
              doc={doc}
              cache={cache}
              selectedId={selected ? board?.do_objectID : undefined}
              selected={selected}
              onLayer={(b, l) => {
                setBoard(b);
                setSelected(l);
              }}
              search={search}
              onSelect={selectBoard}
              onOpen={openBoard}
              cameras={cameras.current}
              focus={focus}
            />
          ) : board ? (
            <Canvas
              key={`detail:${page?.do_objectID}:${board.do_objectID}`}
              cameras={cameras.current}
              cameraKey={`detail:${page?.do_objectID}:${board.do_objectID}`}
              toolbarHost={toolbarHost}
              zoomHost={zoomHost}
              doc={doc}
              scene={scene}
              board={board}
              pageName={page?.name || ''}
              selected={selected}
              onSelect={choose}
              onWarnings={() => setShowWarnings((v) => !v)}
              onOverview={returnOverview}
              focusRequest={detailFocus}
            />
          ) : (
            <main className="center overview-empty">选择画板以查看设计</main>
          )}

          {busy && (
            <div className="canvas-loading" role="status" aria-live="polite" aria-busy="true">
              <LoaderCircle size={28} className="opening-spinner" aria-hidden="true" />
              <p>正在加载页面…</p>
            </div>
          )}

          <Inspector
            selected={selected}
            root={scene?.root || null}
            doc={doc}
            onCopy={copy}
            onLoadFont={(name) => {
              setShowFonts(true);
              pickFont(name);
            }}
            onResizePointerDown={(e) =>
              beginPanelResize(e, {
                startWidth: rightWidth,
                otherWidth: LEFT_PANEL_MIN,
                min: RIGHT_PANEL_MIN,
                max: RIGHT_PANEL_MAX,
                direction: -1,
                onBegin: () => {
                  flushSync(() => {
                    setCanvasLeft(LEFT_PANEL_MIN);
                    setCanvasRight(RIGHT_PANEL_MIN);
                  });
                },
                onChange: setRightWidth,
                onCommit: (width) => {
                  flushSync(() => {
                    setRightWidth(width);
                    setCanvasRight(width);
                    setCanvasLeft(leftWidth);
                  });
                },
                storageKey: RIGHT_PANEL_KEY,
              })
            }
          />
        </div>
      )}

      {showFonts && doc && (
        <FontPanel
          doc={doc}
          fonts={fonts}
          status={fontStatus}
          onClose={() => setShowFonts(false)}
          onLoad={pickFont}
        />
      )}
      {showWarnings && (
        <div className="compat-panel">
          <h3>
            当前画板兼容情况 <button onClick={() => setShowWarnings(false)}>关闭</button>
          </h3>
          <p>
            已启用组件覆盖、轮廓蒙版、组合形状和富文本。缺失字体可通过顶栏的字体入口从本机加载。
          </p>
          {scene?.warnings.length ? (
            <ul>
              {scene.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : (
            <p>未检测到已知的未支持属性；这不代表已经与 Sketch 原稿逐像素对齐。</p>
          )}
          <p>径向渐变、自动布局和文字排版仍可能存在差异。</p>
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => setError('')}>关闭</button>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
      {showExport && doc && scene && (
        <Suspense fallback={null}>
          <AIExport
            doc={doc}
            board={scene.root}
            selected={selected}
            pageName={page?.name || ''}
            warnings={scene.warnings}
            onClose={() => setShowExport(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
