export const size = (n: number) => `${(n / 1024 ** 2).toFixed(1)} MiB`;
export const label = (s: string) =>
  (
    ({ uploading: '等待上传', processing: '处理中', ready: '可查看', failed: '失败' }) as Record<
      string,
      string
    >
  )[s] || s;
