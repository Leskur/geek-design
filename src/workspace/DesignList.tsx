import { useState, type ReactNode } from 'react';
import {
  FilePlus,
  FileImage,
  LoaderCircle,
  Ellipsis,
  ArrowUpRight,
  Upload,
  Link,
  Pencil,
  FolderInput,
  Trash2,
  X,
} from 'lucide-react';
import type { MenuPosition } from '../ContextMenu';
import { designPath, folderPath, spacePath } from '../routes';
import { label } from './format';

export interface DesignSummary {
  id: string;
  name: string;
  space_id?: string;
  folder_id: string | null;
  folder_name?: string;
  status?: string;
  created: number;
  updated?: number;
  created_by?: string;
}
interface Folder {
  id: string;
}
interface Props {
  spaceId: string;
  folder: Folder | null;
  emptyFolder: boolean;
  designsLoaded: boolean;
  visibleFiles: DesignSummary[];
  listView: boolean;
  headingActions?: ReactNode;
  mayUpload: boolean;
  active: boolean;
  beginUpload: (designId?: string, file?: File) => void;
  setFileMenu: (menu: MenuPosition & { item: DesignSummary }) => void;
  copyLink: (designId: string) => Promise<void>;
  canDeleteFile: (design: DesignSummary) => boolean;
  canOverwriteFile: (design: DesignSummary) => boolean;
  canMoveFile: (design: DesignSummary) => boolean;
  requestEdit: (kind: 'design', design: DesignSummary, move?: boolean) => void;
  requestDelete: (kind: 'design', design: DesignSummary) => void;
}
function activityStamp(updated: number, created: number) {
  const when = updated || created;
  if (!when) return '';
  return `${updated > created ? '更新于' : '创建于'} ${new Date(when).toLocaleDateString('zh-CN')}`;
}
export function DesignList({
  spaceId,
  folder,
  emptyFolder,
  designsLoaded,
  visibleFiles,
  listView,
  headingActions,
  mayUpload,
  active,
  beginUpload,
  setFileMenu,
  copyLink,
  canDeleteFile,
  canOverwriteFile,
  canMoveFile,
  requestEdit,
  requestDelete,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [covers, setCovers] = useState<Record<string, 'ready' | 'missing'>>({});
  function markCover(id: string, status: 'ready' | 'missing') {
    setCovers((current) => (current[id] === status ? current : { ...current, [id]: status }));
  }
  return emptyFolder ? (
    <section
      className={`wb-project-empty${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        if (mayUpload) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (mayUpload && e.dataTransfer.files[0]) beginUpload('', e.dataTransfer.files[0]);
      }}
    >
      <div className="wb-upload-illustration">
        <div />
        <div />
        <span>
          <FileImage size={35} strokeWidth={1.3} />
        </span>
      </div>
      <h2>把第一份设计放进来</h2>
      <p>
        {mayUpload
          ? '拖入 Sketch 文件，和伙伴一起查看设计。'
          : folder
            ? '文件夹还没有设计文件，等待伙伴上传即可。'
            : '空间根目录还没有设计文件，等待伙伴上传即可。'}
      </p>
      {mayUpload && (
        <button className="primary" onClick={() => beginUpload()}>
          <FilePlus size={18} />
          上传 Sketch
        </button>
      )}
    </section>
  ) : (
    <section className="wb-files-section">
      <div className="wb-section-heading">
        <h2>设计</h2>
        {headingActions}
      </div>
      {!designsLoaded ? (
        <div className="wb-loading">
          <LoaderCircle size={20} className="wb-spin" />
          正在读取文件…
        </div>
      ) : !visibleFiles.length ? (
        <div className="wb-soft-empty">
          <FileImage size={30} strokeWidth={1.3} />
          <h3>设计文件会显示在这里</h3>
        </div>
      ) : (
        <div className={`wb-file-grid${listView ? ' list' : ''}`}>
          {visibleFiles.map((d) => {
            const sid = d.space_id || spaceId;
            const ready = d.status === 'ready',
              href = ready
                ? designPath(sid, d.id)
                : d.folder_id
                  ? folderPath(d.folder_id)
                  : spacePath(sid);
            return (
              <article
                className="wb-file-card"
                key={d.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFileMenu({ x: e.clientX, y: e.clientY, item: d });
                }}
              >
                <a className="wb-file-cover" href={href} aria-label={`打开 ${d.name}`}>
                  <div className="project-design-cover">
                    {!listView && ready && covers[d.id] !== 'missing' && (
                      <img
                        src={`/api/designs/${encodeURIComponent(d.id)}/cover`}
                        alt=""
                        hidden={covers[d.id] !== 'ready'}
                        draggable={false}
                        onLoad={() => markCover(d.id, 'ready')}
                        onError={() => markCover(d.id, 'missing')}
                      />
                    )}
                    {(listView || !ready || covers[d.id] !== 'ready') && (
                      <div className="project-cover-placeholder">
                        <FileImage size={30} strokeWidth={1.3} />
                        <span>
                          {d.status === 'failed'
                            ? '处理失败'
                            : d.status !== 'ready'
                              ? '等待文件就绪'
                              : '设计稿'}
                        </span>
                      </div>
                    )}
                  </div>
                  {!ready && (
                    <span className="wb-processing">
                      {d.status === 'failed' ? (
                        <X size={12} />
                      ) : (
                        <LoaderCircle size={12} className="wb-spin" />
                      )}
                      {label(d.status || 'uploading')}
                    </span>
                  )}
                </a>
                <div className="wb-file-info">
                  <a className="wb-file-title" href={href} title={d.name}>
                    {d.name}
                  </a>
                  <p>{activityStamp(d.updated || 0, d.created || 0)}</p>
                  <details
                    className="wb-file-menu"
                    onClick={(e) => {
                      if ((e.target as Element).closest('button,a')) e.currentTarget.open = false;
                    }}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        e.currentTarget.open = false;
                        e.currentTarget.querySelector('summary')?.focus();
                      }
                    }}
                  >
                    <summary aria-label={`${d.name}的更多操作`}>
                      <Ellipsis size={16} />
                    </summary>
                    <div>
                      <a href={href}>
                        <ArrowUpRight size={16} />
                        打开设计
                      </a>
                      {canOverwriteFile(d) && (
                        <button aria-label="覆盖上传" onClick={() => beginUpload(d.id)}>
                          <Upload size={16} />
                          覆盖上传
                        </button>
                      )}
                      {ready && (
                        <button aria-label="复制链接" onClick={() => copyLink(d.id)}>
                          <Link size={16} />
                          复制链接
                        </button>
                      )}
                      {canDeleteFile(d) && (
                        <>
                          <button disabled={active} onClick={() => requestEdit('design', d)}>
                            <Pencil size={16} />
                            重命名设计
                          </button>
                          <button
                            disabled={active || !canMoveFile(d)}
                            onClick={() => requestEdit('design', d, true)}
                          >
                            <FolderInput size={16} />
                            移动到文件夹
                          </button>
                        </>
                      )}
                      {canDeleteFile(d) && (
                        <button
                          className="danger"
                          disabled={active}
                          onClick={() => requestDelete('design', d)}
                        >
                          <Trash2 size={16} />
                          删除设计
                        </button>
                      )}
                    </div>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
