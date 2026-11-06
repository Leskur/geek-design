import { ArrowLeft, X } from 'lucide-react';
import { localOnly, folderPath, spacePath, withBase } from './routes';
export function ViewerNavigation({
  folderId,
  spaceId,
  projectId,
  detail = false,
  onOverview,
}: {
  folderId?: string;
  spaceId?: string;
  /** @deprecated use folderId */
  projectId?: string;
  detail?: boolean;
  onOverview?: () => void;
}) {
  if (detail)
    return (
      <button
        type="button"
        className="viewer-back"
        aria-label="返回总览"
        title="返回总览"
        onClick={onOverview}
      >
        <ArrowLeft size={18} />
      </button>
    );
  const id = folderId || projectId;
  const href = localOnly
    ? withBase('/')
    : withBase(id ? folderPath(id) : spaceId ? spacePath(spaceId) : '/spaces');
  const label = localOnly
    ? '关闭设计，返回首页'
    : id
      ? '关闭设计，返回文件夹'
      : spaceId
        ? '关闭设计，返回空间'
        : '关闭设计，返回工作台';
  return (
    <a className="team-link viewer-back" href={href} aria-label={label} title={label}>
      <X size={18} />
    </a>
  );
}
