import test from 'node:test';
import assert from 'node:assert/strict';
import { wheelZoomFactor } from '../src/wheel-zoom';
import { zoomAt } from '../src/interaction';
import { zoomPage } from '../src/overview';

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≠ ${expected}`);
}
const macChrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/142.0.0.0';
const pinch = (deltaY: number) =>
  wheelZoomFactor({ deltaY, deltaMode: 0, ctrlKey: true }, macChrome);

test('pinch follows the browser scale and reverses without drift', () => {
  near(pinch(-100 * Math.log(1.5)), 1.5);
  near(pinch(-100 * Math.log(0.8)), 0.8);
  near(pinch(12.5) * pinch(-12.5), 1);
});

test('high-frequency pinch events preserve the anchor and total scale in both views', () => {
  for (const zoom of [zoomAt, zoomPage]) {
    const start = { x: 30, y: -45, scale: 0.7 };
    const anchor = { x: 320, y: 240 };
    let camera = start;
    for (let i = 0; i < 120; i++) camera = zoom(camera, camera.scale * pinch(-0.25), anchor);
    const single = zoom(start, start.scale * pinch(-30), anchor);
    near(camera.scale, single.scale);
    near(camera.x, single.x);
    near(camera.y, single.y);
    near((anchor.x - camera.x) / camera.scale, (anchor.x - start.x) / start.scale);
    near((anchor.y - camera.y) / camera.scale, (anchor.y - start.y) / start.scale);
  }
});

test('Windows wheel zoom keeps the original sensitivity in every delta mode', () => {
  const windowsChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/142.0.0.0';
  for (const deltaMode of [0, 1, 2]) {
    near(wheelZoomFactor({ deltaY: 20, deltaMode, ctrlKey: true }, windowsChrome), Math.exp(-0.04));
  }
});

test('Mac Edge follows the pinch and Command+wheel keeps the original sensitivity', () => {
  const macEdge = macChrome + ' Edg/142.0.0.0';
  near(wheelZoomFactor({ deltaY: -20, deltaMode: 0, ctrlKey: true }, macEdge), Math.exp(0.2));
  near(wheelZoomFactor({ deltaY: 20, deltaMode: 0, ctrlKey: false }, macChrome), Math.exp(-0.04));
});
