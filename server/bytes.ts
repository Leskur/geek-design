export function byteLimit(name: string, value?: string) {
  const raw = value?.trim();
  if (!raw || raw === '0') return undefined;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new Error(`${name} 必须是正整数字节数，留空或 0 表示不限制`);
  return n;
}
