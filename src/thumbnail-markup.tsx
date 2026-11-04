import { renderToStaticMarkup } from 'react-dom/server';
import { color, type Layer, type DocumentSource } from '../shared/document';
import { Children, ThumbnailTextContext } from '../shared/rendering/renderer';
export { thumbnailSize, thumbnailPixelScale } from './thumbnail-size';

export function collectImageRefs(layer: Layer, refs = new Set<string>()) {
  if (layer.isVisible === false || layer._hiddenSymbol) return refs;
  if (layer.image?._ref) refs.add(layer.image._ref);
  for (const fill of layer.style?.fills || [])
    if (fill.isEnabled && fill.image?._ref) refs.add(fill.image._ref);
  layer.layers?.forEach((child) => collectImageRefs(child, refs));
  return refs;
}

export function thumbnailMarkup(
  root: Layer,
  images: Record<string, string>,
  width: number,
  height: number,
) {
  const source = {
    previewImages: new Map(Object.entries(images)),
    image: async (ref: string) => images[ref] || '',
  } as unknown as DocumentSource;
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox={`0 0 ${root.frame.width} ${root.frame.height}`}
    >
      <rect
        width={root.frame.width}
        height={root.frame.height}
        fill={root.hasBackgroundColor ? color(root.backgroundColor) : '#fff'}
      />
      <ThumbnailTextContext.Provider value={true}>
        <Children
          layers={root.layers || []}
          doc={source}
          choose={() => {}}
          w={root.frame.width}
          h={root.frame.height}
          interactive={false}
        />
      </ThumbnailTextContext.Provider>
    </svg>,
  );
}
