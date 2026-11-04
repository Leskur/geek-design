import { useState } from 'react';
import {
  LayoutGrid,
  List,
  CloudUpload,
  FileImage,
  LoaderCircle,
  Search,
  Ellipsis,
  ArrowUpRight,
  History,
  Upload,
  Link,
  Folder,
  Pencil,
  FolderInput,
  Trash2,
  X,
} from 'lucide-react';
import { DesignCover } from '../DesignCover';
import { ManagementSearch } from '../ManagementSearch';
import type { MenuPosition } from '../ContextMenu';
import { documentPath, projectPath, revisionPath } from '../routes';
import type { DesignSort } from '../workbench';
import { label } from './format';

export interface DesignSummary {
  id: string;
  name: string;
  project_id: string;
  current_revision?: string;
  status?: string;
  created: number;
  updated?: number;
}
interface Project {
  id: string;
}
interface Props {
  project: Project | null;
  emptyProject: boolean;
  documentsLoaded: boolean;
  visibleFiles: DesignSummary[];
  search: string;
  setSearch: (value: string) => void;
  sort: DesignSort;
  changeSort: (value: DesignSort) => void;
  listView: boolean;
  changeView: (list: boolean) => void;
  mayUpload: boolean;
  active: boolean;
  beginUpload: (documentId?: string, file?: File) => void;
  setFileMenu: (menu: MenuPosition & { item: DesignSummary }) => void;
  loadDocument: (id: string, reveal?: boolean) => Promise<unknown>;
  copyLink: (revisionId: string, documentId?: string) => Promise<void>;
  canDeleteFile: (design: DesignSummary) => boolean;
  canMoveFile: (design: DesignSummary) => boolean;
  requestEdit: (kind: 'document', design: DesignSummary, move?: boolean) => void;
  requestDelete: (kind: 'document', design: DesignSummary) => void;
}
export function DesignList({
  project,
  emptyProject,
  documentsLoaded,
  visibleFiles,
  search,
  setSearch,
  sort,
  changeSort,
  listView,
  changeView,
  mayUpload,
  active,
  beginUpload,
  setFileMenu,
  loadDocument,
  copyLink,
  canDeleteFile,
  canMoveFile,
  requestEdit,
  requestDelete,
}: Props) {
  const [dragging, setDragging] = useState(false);
  return emptyProject && !search ? (
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
          : '项目还没有设计文件，等待伙伴上传即可。'}
      </p>
      {mayUpload && (
        <button className="primary" onClick={() => beginUpload()}>
          <CloudUpload size={18} />
          上传 Sketch
        </button>
      )}
    </section>
  ) : (
    <section className="wb-files-section">
      <div className="project-list-toolbar">
        <ManagementSearch label="搜索设计" value={search} onChange={setSearch} />
        <label className="management-sort">
          <span className="sr-only">设计排序</span>
          <select
            aria-label="设计排序"
            value={sort}
            onChange={(e) => changeSort(e.target.value as DesignSort)}
          >
            <option value="updated">最近更新</option>
            <option value="name">名称排序</option>
          </select>
        </label>
        <div className="wb-view-switch" role="group" aria-label="文件展示方式">
          <button aria-label="网格视图" aria-pressed={!listView} onClick={() => changeView(false)}>
            <LayoutGrid size={16} />
          </button>
          <button aria-label="列表视图" aria-pressed={listView} onClick={() => changeView(true)}>
            <List size={16} />
          </button>
        </div>
      </div>
      {project && !documentsLoaded ? (
        <div className="wb-loading">
          <LoaderCircle size={20} className="wb-spin" />
          正在读取文件…
        </div>
      ) : !visibleFiles.length ? (
        <div className="wb-soft-empty">
          <Search size={30} />
          <h3>{search ? '没有找到匹配的设计' : '设计文件会显示在这里'}</h3>
          {search && <button onClick={() => setSearch('')}>清除搜索</button>}
        </div>
      ) : (
        <div className={`wb-file-grid${listView ? ' list' : ''}`}>
          {visibleFiles.map((d) => {
            const id = d.project_id || project?.id;
            if (!id) return null;
            const ready = !!d.current_revision,
              href = ready ? revisionPath(id, d.id, d.current_revision!) : documentPath(id, d.id);
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
                  <DesignCover
                    key={`${d.id}:${d.current_revision || ''}`}
                    documentId={d.id}
                    revisionId={d.current_revision}
                    status={d.status}
                  />
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
                  <p>{new Date(d.updated || d.created).toLocaleDateString('zh-CN')}</p>
                </div>
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
                    <Ellipsis size={18} />
                  </summary>
                  <div>
                    <a href={href}>
                      <ArrowUpRight size={16} />
                      打开设计
                    </a>
                    {project ? (
                      <>
                        <button aria-label="上传记录" onClick={() => void loadDocument(d.id, true)}>
                          <History size={16} />
                          上传记录
                        </button>
                        {mayUpload && (
                          <button aria-label="上传新稿" onClick={() => beginUpload(d.id)}>
                            <Upload size={16} />
                            上传新稿
                          </button>
                        )}
                        {ready && (
                          <button
                            aria-label="复制链接"
                            onClick={() => copyLink(d.current_revision!, d.id)}
                          >
                            <Link size={16} />
                            复制链接
                          </button>
                        )}
                      </>
                    ) : (
                      <a href={projectPath(id)}>
                        <Folder size={16} />
                        前往项目
                      </a>
                    )}
                    {canDeleteFile(d) && (
                      <>
                        <button disabled={active} onClick={() => requestEdit('document', d)}>
                          <Pencil size={16} />
                          重命名设计
                        </button>
                        <button
                          disabled={active || !canMoveFile(d)}
                          onClick={() => requestEdit('document', d, true)}
                        >
                          <FolderInput size={16} />
                          移动到项目
                        </button>
                      </>
                    )}
                    {canDeleteFile(d) && (
                      <button
                        className="danger"
                        disabled={active}
                        onClick={() => requestDelete('document', d)}
                      >
                        <Trash2 size={16} />
                        删除设计
                      </button>
                    )}
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
