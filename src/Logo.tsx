/** Single-color GK fish mark. The image has no background or raster effects. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <img
      className="wb-brand-icon gd-logo"
      src={new URL('./assets/geekdesign.svg', import.meta.url).href}
      width={size}
      height={Math.round((size * 2) / 3)}
      alt=""
      aria-hidden="true"
      style={{ flexShrink: 0, objectFit: 'contain' }}
    />
  );
}
