import { fontFamilies } from '../shared/fonts';

// FontFaceSet.check() alone returns true for unknown families without registered faces.
// Compare with different fallback metrics to detect unavailable local font names.
export function hasFont(name: string) {
  // Registered faces are authoritative; measuring at normal weight can miss a bold-only face.
  const normalize = (family: string) =>
    family
      .trim()
      .replace(/^["']|["']$/g, '')
      .toLowerCase();
  let registered = false;
  document.fonts?.forEach((face) => {
    if (face.status === 'loaded' && normalize(face.family) === normalize(name)) registered = true;
  });
  if (registered) return true;
  const weight = /black|heavy/i.test(name)
    ? 900
    : /semibold|demibold/i.test(name)
      ? 600
      : /bold/i.test(name)
        ? 700
        : /medium/i.test(name)
          ? 500
          : /light|thin/i.test(name)
            ? 300
            : 400;
  const style = /italic|oblique/i.test(name) ? 'italic' : 'normal';
  const canvas = document.createElement('canvas'),
    context = canvas.getContext('2d');
  if (!context) return false;
  const sample = 'BESbswy 0123456789 汉字字体测试';
  return fontFamilies(name).some((family) =>
    ['monospace', 'serif', 'sans-serif'].some((fallback) => {
      context.font = `${style} ${weight} 64px ${fallback}`;
      const base = context.measureText(sample).width;
      context.font = `${style} ${weight} 64px "${family.replace(/["\\]/g, '')}", ${fallback}`;
      return Math.abs(context.measureText(sample).width - base) > 0.01;
    }),
  );
}
