import { useRef, type ReactNode } from 'react';
import { ArrowUpRight, FileImage, FileUp, Pause, Play, Upload } from 'lucide-react';
import { Dialog } from '../Dialog';
import { designPath } from '../routes';
import { size } from './format';
import type { useDesignUpload } from './useDesignUpload';

interface Props {
  upload: ReturnType<typeof useDesignUpload>;
  spaceId: string;
  targetName?: string;
  alert: ReactNode;
}
export function UploadDialog({ upload, spaceId, targetName, alert }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const {
    target,
    setShowUpload,
    file,
    active,
    chooseFile,
    phase,
    designName,
    setDesignName,
    uploadLabel,
    progress,
    pause,
    currentDesign,
    startUpload,
  } = upload;
  return (
    <Dialog title={target ? '覆盖上传当前设计' : '上传设计文件'} onClose={() => setShowUpload(false)}>
      <div className="wb-upload-body">
        {target && <p className="wb-dialog-description">{targetName || '更新当前设计'}</p>}
        <input
          ref={input}
          type="file"
          hidden
          accept=".sketch"
          disabled={active}
          onChange={(e) => {
            if (e.target.files?.[0]) chooseFile(e.target.files[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          className={`wb-file-drop${file ? ' selected' : ''}`}
          disabled={active}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (!active && e.dataTransfer.files[0]) chooseFile(e.dataTransfer.files[0]);
          }}
        >
          {file ? (
            <>
              <FileImage size={32} />
              <b>{file.name}</b>
              <span>{size(file.size)} · 点击更换文件</span>
            </>
          ) : (
            <>
              <FileUp size={34} strokeWidth={1.5} />
              <b>选择或拖入 Sketch 文件</b>
            </>
          )}
        </button>
        {file && !active && phase !== 'done' && !target && (
          <div className="wb-upload-fields">
            <label>
              设计名称
              <input
                value={designName}
                onChange={(e) => setDesignName(e.target.value)}
                maxLength={120}
                placeholder="默认使用文件名"
              />
            </label>
          </div>
        )}
        {(active || phase === 'done') && (
          <div className="wb-upload-progress">
            <div>
              <span>{uploadLabel}</span>
              <b>
                {['hashing', 'uploading', 'paused'].includes(phase)
                  ? `${Math.round(progress * 100)}%`
                  : ''}
              </b>
            </div>
            <progress
              aria-label="上传进度"
              max={1}
              value={phase === 'processing' ? undefined : progress}
            />
          </div>
        )}
        {alert}
        <div className="wb-dialog-actions">
          <button type="button" onClick={() => setShowUpload(false)}>
            {active ? '收起' : phase === 'done' ? '关闭' : '取消'}
          </button>
          {['hashing', 'uploading'].includes(phase) && (
            <button onClick={pause}>
              <Pause size={14} />
              {phase === 'hashing' ? '停止校验' : '暂停'}
            </button>
          )}
          {phase === 'done' && currentDesign?.status === 'ready' && currentDesign.id ? (
            <a className="primary wb-button-link" href={designPath(spaceId, currentDesign.id)}>
              <ArrowUpRight size={16} />
              打开设计
            </a>
          ) : (
            <button
              className="primary"
              disabled={!file || ['hashing', 'uploading', 'processing'].includes(phase)}
              onClick={startUpload}
            >
              {phase === 'paused' ? <Play size={16} /> : <Upload size={16} />}{' '}
              {phase === 'paused' ? '继续上传' : phase === 'processing' ? '正在准备设计…' : '上传'}
            </button>
          )}
        </div>
        {active && (
          <p className="wb-upload-hint">
            {phase === 'paused' ? '上传已暂停，可稍后继续。' : '收起弹窗后，任务会在当前页面继续。'}
          </p>
        )}
      </div>
    </Dialog>
  );
}
