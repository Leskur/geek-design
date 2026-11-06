import type { Distance } from './interaction';

export function paintRuler(ctx: CanvasRenderingContext2D, d: Distance, scale: number) {
  const x = (d.from.x + d.to.x) / 2,
    y = (d.from.y + d.to.y) / 2,
    label = `${Number(d.value.toFixed(1))}`,
    width = (label.length * 6 + 12) / scale,
    height = 17 / scale,
    lx = d.axis === 'x' ? x - width / 2 : x + 7 / scale,
    ly = d.axis === 'x' ? y - 23 / scale : y - height / 2;
  ctx.strokeStyle = '#f45a76';
  ctx.lineWidth = 1 / scale;
  ctx.setLineDash([3 / scale, 3 / scale]);
  ctx.globalAlpha = 0.6;
  for (const g of d.guides) {
    ctx.beginPath();
    ctx.moveTo(g.from.x, g.from.y);
    ctx.lineTo(g.to.x, g.to.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(d.from.x, d.from.y);
  ctx.lineTo(d.to.x, d.to.y);
  ctx.stroke();
  for (const p of [d.from, d.to]) {
    ctx.beginPath();
    ctx.moveTo(p.x - (d.axis === 'y' ? 3 / scale : 0), p.y - (d.axis === 'x' ? 3 / scale : 0));
    ctx.lineTo(p.x + (d.axis === 'y' ? 3 / scale : 0), p.y + (d.axis === 'x' ? 3 / scale : 0));
    ctx.stroke();
  }
  const r = 3 / scale;
  ctx.fillStyle = '#f45a76';
  ctx.beginPath();
  ctx.moveTo(lx + r, ly);
  ctx.arcTo(lx + width, ly, lx + width, ly + height, r);
  ctx.arcTo(lx + width, ly + height, lx, ly + height, r);
  ctx.arcTo(lx, ly + height, lx, ly, r);
  ctx.arcTo(lx, ly, lx + width, ly, r);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `${10 / scale}px Inter, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx + width / 2, ly + height / 2);
}
