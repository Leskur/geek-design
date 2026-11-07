import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Type, Upload, Trash2, LoaderCircle, Download, Eye, EyeClosed } from 'lucide-react';
import { api } from './api';
import { ManagementSearch } from './ManagementSearch';
import { Dialog } from './Dialog';
import { loadBrowserFont, type SpaceFont } from './space-fonts';
const limit = 20 * 1024 ** 2;
export function SpaceFonts({ space, me }: { space: any; me: { id: string } }) {
  const [fonts, setFonts] = useState<SpaceFont[]>([]),
    [loaded, setLoaded] = useState(false),
    [query, setQuery] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(''),
    [remove, setRemove] = useState<SpaceFont | null>(null),
    [previews, setPreviews] = useState<string[]>([]),
    [previewLoading, setPreviewLoading] = useState<string[]>([]),
    [downloading, setDownloading] = useState('');
  const input = useRef<HTMLInputElement>(null),
    alive = useRef(true),
    working = useRef(false),
    saving = useRef(''),
    controller = useRef(new AbortController()),
    faces = useRef(new Map<string, FontFace[]>()),
    loading = useRef(new Set<string>());
  const canUpload = !!me;
  const canRemove = (font: SpaceFont) => space.role === 'owner' || font.created_by === me.id;
  async function refresh() {
    const list = await api<SpaceFont[]>(`/spaces/${space.id}/fonts`, {
      signal: controller.current.signal,
    });
    if (alive.current) {
      setFonts(list);
      setLoaded(true);
    }
  }
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => {
      if (alive.current) setNotice('');
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    alive.current = true;
    if (controller.current.signal.aborted) controller.current = new AbortController();
    void refresh().catch((e) => {
      if (alive.current) setError(e.message);
    });
    return () => {
      alive.current = false;
      controller.current.abort();
      for (const loaded of faces.current.values())
        for (const face of loaded) document.fonts.delete(face);
      faces.current.clear();
    };
  }, [space.id]);
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let added = 0,
      duplicates = 0;
    try {
      for (const file of files) {
        if (!/[.](ttf|otf|woff|woff2)$/i.test(file.name) || file.size > limit)
          throw Error(`${file.name}：支持 TTF、OTF、WOFF、WOFF2，单个文件不超过 20 MB`);
        setProgress(`正在上传 ${file.name}`);
        const response = await fetch(`/api/spaces/${space.id}/fonts`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Font-Filename': encodeURIComponent(file.name),
          },
          body: await file.arrayBuffer(),
          signal: controller.current.signal,
        });
        const result = await response.json();
        if (!response.ok) throw Error(result.error || '上传失败');
        result.duplicate ? duplicates++ : added++;
      }
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      try {
        await refresh();
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      }
      working.current = false;
      if (alive.current) {
        setBusy(false);
        setProgress('');
        if (added || duplicates)
          setNotice(
            [
              added ? `已添加 ${added} 个字体` : '',
              duplicates ? `${duplicates} 个重复字体已跳过` : '',
            ]
              .filter(Boolean)
              .join('，'),
          );
      }
    }
  }
  function dropPreview(id: string) {
    for (const face of faces.current.get(id) || []) document.fonts.delete(face);
    faces.current.delete(id);
    setPreviews((current) => current.filter((item) => item !== id));
  }
  async function showPreview(font: SpaceFont) {
    if (loading.current.has(font.id)) return;
    if (previews.includes(font.id)) {
      dropPreview(font.id);
      return;
    }
    loading.current.add(font.id);
    setPreviewLoading((current) => (current.includes(font.id) ? current : [...current, font.id]));
    setError('');
    try {
      const next = await loadBrowserFont(
        font,
        controller.current.signal,
        `space-font-preview-${font.id}`,
      );
      if (!alive.current) {
        for (const face of next) document.fonts.delete(face);
        return;
      }
      faces.current.set(font.id, next);
      setPreviews((current) => (current.includes(font.id) ? current : [...current, font.id]));
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      loading.current.delete(font.id);
      if (alive.current) setPreviewLoading((current) => current.filter((id) => id !== font.id));
    }
  }
  async function downloadFont(font: SpaceFont) {
    if (saving.current) return;
    saving.current = font.id;
    setDownloading(font.id);
    setError('');
    try {
      const response = await fetch(font.url, {
        credentials: 'same-origin',
        signal: controller.current.signal,
      });
      if (!response.ok) {
        let message = `「${font.full_name}」下载失败`;
        try {
          const body = await response.json();
          if (body?.error) message = body.error;
        } catch {
          /* The error body is optional. */
        }
        throw Error(message);
      }
      const blob = await response.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement('a');
      a.href = url;
      a.download = font.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if ((e as Error).name !== 'AbortError' && alive.current) setError((e as Error).message);
    } finally {
      saving.current = '';
      if (alive.current) setDownloading('');
    }
  }
  async function deleteFont() {
    if (!remove || working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await api(`/spaces/${space.id}/fonts/${remove.id}`, { method: 'DELETE' });
      if (previews.includes(remove.id)) dropPreview(remove.id);
      await refresh();
      setRemove(null);
      setNotice('字体已删除');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const visible = fonts.filter((f) =>
    `${f.family} ${f.full_name} ${f.postscript_name} ${f.filename}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  const fontsNetIcon = new URL('./assets/fonts-net.ico', import.meta.url).href;
  const fontSite = (
    <p className="management-font-site">
      <span>社区资源：</span>
      <a href="https://www.fonts.net.cn/" target="_blank" rel="noopener noreferrer">
        <img src={fontsNetIcon} alt="" width={14} height={14} />
        字体天下
      </a>
    </p>
  );
  return (
    <div className="management-fonts">
      {error && !remove && (
        <div className="team-error" role="alert">
          {error}
          {!loaded && (
            <button
              onClick={() => {
                setError('');
                void refresh().catch((e) => setError(e.message));
              }}
            >
              重新加载
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="wb-toast" role="status">
          {notice}
        </div>
      )}
      <div className="management-font-head">
        <div className="management-font-heading">
          <h2 className="management-fonts-title">字体</h2>
          {fontSite}
        </div>
        {loaded && fonts.length > 0 && (
          <div className="management-font-toolbar">
            <ManagementSearch label="搜索字体" value={query} onChange={setQuery} />
            {canUpload && (
              <button
                className="primary"
                disabled={busy}
                title="TTF、OTF、WOFF、WOFF2，单个不超过 20 MB"
                onClick={() => input.current?.click()}
              >
                {busy ? <LoaderCircle size={15} className="wb-spin" /> : <Upload size={15} />}
                上传字体
              </button>
            )}
          </div>
        )}
        <input
          ref={input}
          hidden
          type="file"
          aria-label="选择字体文件"
          accept=".ttf,.otf,.woff,.woff2"
          multiple
          onChange={(e) => void upload(e)}
        />
      </div>
      {progress && (
        <p className="management-caption" role="status">
          {progress}
        </p>
      )}
      {!loaded && !error ? (
        <div className="wb-loading" role="status">
          <LoaderCircle size={20} className="wb-spin" />
          正在读取字体…
        </div>
      ) : (
        loaded &&
        (visible.length ? (
          <section className="management-panel" aria-label="空间字体库">
            {visible.map((font) => (
              <div className="management-font-entry" key={font.id}>
                <div className="management-font-row">
                  <span className="management-font-icon">
                    <Type size={21} />
                  </span>
                  <div className="management-font-identity">
                    <b>{font.full_name}</b>
                    <span title={font.filename}>
                      {font.filename} · {font.weight} · {font.style === 'italic' ? '斜体' : '常规'}{' '}
                      · {(font.size / 1024 ** 2).toFixed(2)} MB
                    </span>
                  </div>
                  <div className="management-font-actions">
                    <button
                      className="wb-icon-button"
                      disabled={previewLoading.includes(font.id)}
                      aria-label={
                        previewLoading.includes(font.id)
                          ? `正在加载 ${font.full_name}`
                          : previews.includes(font.id)
                            ? `收起 ${font.full_name}`
                            : `预览 ${font.full_name}`
                      }
                      title={
                        previewLoading.includes(font.id)
                          ? '加载中…'
                          : previews.includes(font.id)
                            ? '收起'
                            : '预览'
                      }
                      onClick={() => void showPreview(font)}
                    >
                      {previewLoading.includes(font.id) ? (
                        <LoaderCircle size={15} className="wb-spin" />
                      ) : previews.includes(font.id) ? (
                        <EyeClosed size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                    <button
                      className="wb-icon-button"
                      disabled={!!downloading}
                      aria-label={`下载字体 ${font.full_name}`}
                      title={downloading === font.id ? '下载中…' : '下载'}
                      onClick={() => void downloadFont(font)}
                    >
                      {downloading === font.id ? (
                        <LoaderCircle size={15} className="wb-spin" />
                      ) : (
                        <Download size={15} />
                      )}
                    </button>
                    {canRemove(font) && (
                      <button
                        className="wb-icon-button"
                        disabled={busy}
                        aria-label={`删除字体 ${font.full_name}`}
                        onClick={() => {
                          setError('');
                          setRemove(font);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
                {previews.includes(font.id) && (
                  <div
                    className="management-font-preview"
                    style={{
                      fontFamily: `"space-font-preview-${font.id}"`,
                      fontWeight: font.weight,
                      fontStyle: font.style,
                    }}
                  >
                    设计让协作更简单
                    <br />
                    The quick brown fox 0123456789
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : (
          <div className="wb-soft-empty">
            <Type size={30} />
            <h3>{query ? '没有匹配的字体' : '还没有字体'}</h3>
            {!query && <p>上传后，打开设计会自动匹配。</p>}
            {query ? (
              <button onClick={() => setQuery('')}>清除搜索</button>
            ) : (
              canUpload && (
                <>
                  <button
                    title="TTF、OTF、WOFF、WOFF2，单个不超过 20 MB"
                    onClick={() => input.current?.click()}
                  >
                    <Upload size={15} />
                    上传字体
                  </button>
                  <p className="management-font-hint">TTF、OTF、WOFF、WOFF2，单个不超过 20 MB。</p>
                </>
              )
            )}
          </div>
        ))
      )}
      {remove && (
        <Dialog
          title="删除字体"
          onClose={() => {
            if (!busy) setRemove(null);
          }}
        >
          <div className="wb-upload-body">
            <p className="wb-dialog-description">
              删除「{remove.full_name}」？打开设计时不再使用这款字体。
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
                onClick={() => void deleteFont()}
              >
                {busy ? '删除中…' : '删除字体'}
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
