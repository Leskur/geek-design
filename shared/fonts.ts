import type { Layer } from './document';

export function fontFamilies(name: string) {
  const base = name.replace(
    /-(?:Regular|Medium|Semibold|SemiBold|DemiBold|Bold|Light|Thin|Heavy|Black|Italic|BoldItalic|Book|Roman)(?:MT)?$/i,
    '',
  );
  const aliases: Record<string, string> = {
    PingFangSC: 'PingFang SC',
    PingFangTC: 'PingFang TC',
    HelveticaNeue: 'Helvetica Neue',
    ArialMT: 'Arial',
    Arial: 'Arial',
    TimesNewRomanPSMT: 'Times New Roman',
  };
  return [...new Set([name, base, aliases[base]].filter(Boolean))];
}

export function fontNames(
  root: Layer | null,
  library?: { symbols: Map<string, Layer>; styles?: Map<string, any> },
) {
  const names = new Set<string>(),
    visited = new Set<Layer>(),
    symbols = new Set<string>();
  function attributes(a: any) {
    const name = a?.MSAttributedStringFontAttribute?.attributes?.name;
    if (name) names.add(name);
  }
  function symbol(id: string) {
    if (!id || symbols.has(id)) return;
    symbols.add(id);
    const master = library?.symbols.get(id);
    if (master) visit(master);
  }
  function visit(l: Layer) {
    if (visited.has(l)) return;
    visited.add(l);
    for (const run of l.attributedString?.attributes || []) attributes(run.attributes);
    attributes(l.style?.textStyle?.encodedAttributes);
    if (l._class === 'symbolInstance') symbol(l.symbolID);
    for (const override of l.overrideValues || []) {
      if (override.overrideName.endsWith('_symbolID')) symbol(override.value);
      if (override.overrideName.endsWith('_textStyle'))
        attributes(library?.styles?.get(override.value)?.textStyle?.encodedAttributes);
    }
    l.layers?.forEach(visit);
  }
  if (root) visit(root);
  return [...names].sort();
}
