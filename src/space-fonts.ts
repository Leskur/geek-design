import { fontFamilies } from '../shared/fonts';
export type SpaceFont = {
  id: string;
  filename: string;
  family: string;
  full_name: string;
  postscript_name: string;
  weight: number;
  style: string;
  size: number;
  created_by?: string;
  created: number;
  url: string;
};
export function exactSpaceFont(fonts: SpaceFont[], name: string): SpaceFont | undefined {
  const key = name.toLowerCase();
  return (
    fonts.find((f) => f.postscript_name.toLowerCase() === key) ||
    fonts.find((f) => f.full_name.toLowerCase() === key)
  );
}
export function matchingSpaceFonts(fonts: SpaceFont[], names: string[]): SpaceFont[] {
  const found = new Set<string>();
  for (const name of names) {
    const exact = fonts.filter((f) =>
      [f.postscript_name, f.full_name].some((n) => n.toLowerCase() === name.toLowerCase()),
    );
    const aliases = fontFamilies(name).map((n) => n.toLowerCase());
    for (const font of exact.length
      ? exact
      : fonts.filter((f) => aliases.includes(f.family.toLowerCase())))
      found.add(font.id);
  }
  return fonts.filter((f) => found.has(f.id));
}
export async function loadBrowserFont(
  font: SpaceFont,
  signal?: AbortSignal,
  previewAlias?: string,
): Promise<FontFace[]> {
  const response = await fetch(font.url, { credentials: 'same-origin', signal });
  if (!response.ok) throw new Error(`字体「${font.full_name}」加载失败`);
  const bytes = await response.arrayBuffer(),
    names = previewAlias
      ? [previewAlias]
      : [...new Set([font.postscript_name, font.full_name, font.family])];
  const faces = await Promise.all(
    names.map((name) =>
      new FontFace(JSON.stringify(name), bytes, {
        weight: String(font.weight),
        style: font.style,
      }).load(),
    ),
  );
  if (signal?.aborted) throw new DOMException('字体加载已取消', 'AbortError');
  for (const face of faces) document.fonts.add(face);
  window.dispatchEvent(new Event('viewer-fonts-changed'));
  return faces;
}
