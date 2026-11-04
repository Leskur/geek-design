import test from 'node:test';
import assert from 'node:assert/strict';
import { openAsBlob, existsSync } from 'node:fs';
import paper from 'paper';
import { resolveBoard, resizeFrame, maskChains, textRuns } from '../shared/rendering/scene';
import { geometry, fillRule } from '../shared/rendering/geometry';
import { SketchDocument, type Layer } from '../src/sketch';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Children } from '../shared/rendering/renderer';

const frame = (x = 0, y = 0, width = 100, height = 100) => ({ x, y, width, height });
const layer = (id: string, extra: any = {}): Layer => ({
  _class: 'rectangle',
  do_objectID: id,
  name: id,
  frame: frame(),
  ...extra,
});
const master = layer('master', {
  _class: 'symbolMaster',
  symbolID: 's',
  layers: [
    layer('label', {
      _class: 'text',
      attributedString: {
        string: 'Original',
        attributes: [
          {
            location: 0,
            length: 8,
            attributes: {
              MSAttributedStringFontAttribute: { attributes: { name: 'Arial', size: 14 } },
            },
          },
        ],
      },
    }),
  ],
});
const lib = { symbols: new Map([['s', master]]) };
const scene = (layers: Layer[]) =>
  resolveBoard(layer('board', { _class: 'artboard', layers }), lib);

test('instance text overrides affect inspection and do not mutate the master', () => {
  const a = layer('a', {
    _class: 'symbolInstance',
    symbolID: 's',
    overrideValues: [{ overrideName: 'label_stringValue', value: 'Changed' }],
  });
  const result = scene([a, layer('b', { _class: 'symbolInstance', symbolID: 's' })]);
  const [first, second] = result.root.layers!;
  assert.equal(first.layers![0].attributedString.string, 'Changed');
  assert.equal(first.layers![0].attributedString.attributes[0].length, 7);
  assert.equal(second.layers![0].attributedString.string, 'Original');
  assert.notEqual(first.layers![0].do_objectID, second.layers![0].do_objectID);
  assert.equal(master.layers![0].attributedString.string, 'Original');
});
test('nested parent overrides take priority over inner defaults', () => {
  const outer = layer('outer', {
    _class: 'symbolMaster',
    symbolID: 'outer',
    layers: [
      layer('nested', {
        _class: 'symbolInstance',
        symbolID: 's',
        overrideValues: [{ overrideName: 'label_stringValue', value: 'Inner' }],
      }),
    ],
  });
  const library = { symbols: new Map([...lib.symbols, ['outer', outer]]) };
  const result = resolveBoard(
    layer('board', {
      layers: [
        layer('instance', {
          _class: 'symbolInstance',
          symbolID: 'outer',
          overrideValues: [{ overrideName: 'nested/label_stringValue', value: 'Outer' }],
        }),
      ],
    }),
    library,
  );
  assert.equal(result.root.layers![0].layers![0].layers![0].attributedString.string, 'Outer');
});
test('color, text size, and image overrides are applied to resolved data', () => {
  const green = { red: 0, green: 1, blue: 0, alpha: 1 };
  const m = layer('m', {
    _class: 'symbolMaster',
    symbolID: 'm',
    layers: [
      layer('rect', {
        style: { fills: [{ isEnabled: true, fillType: 0, color: { red: 1, green: 0, blue: 0 } }] },
      }),
      master.layers![0],
      layer('image', { _class: 'bitmap', image: { _ref: 'images/a' } }),
    ],
  });
  const result = resolveBoard(
    layer('board', {
      layers: [
        layer('i', {
          _class: 'symbolInstance',
          symbolID: 'm',
          overrideValues: [
            { overrideName: 'rect_color:fill-0', value: green },
            { overrideName: 'label_textSize', value: '20' },
            { overrideName: 'label_textColor', value: green },
            { overrideName: 'image_image', value: { _ref: 'images/b' } },
          ],
        }),
      ],
    }),
    { symbols: new Map([['m', m]]) },
  );
  const [rect, text, image] = result.root.layers![0].layers!;
  assert.deepEqual(rect.style.fills[0].color, green);
  assert.equal(
    text.attributedString.attributes[0].attributes.MSAttributedStringFontAttribute.attributes.size,
    20,
  );
  assert.deepEqual(
    text.attributedString.attributes[0].attributes.MSAttributedStringColorAttribute,
    green,
  );
  assert.equal(image.image._ref, 'images/b');
});
test('nested symbol replacements and empty symbol overrides are respected', () => {
  const outer = layer('outer', {
    _class: 'symbolMaster',
    symbolID: 'outer',
    layers: [layer('nested', { _class: 'symbolInstance', symbolID: 's' })],
  });
  const library = { symbols: new Map([...lib.symbols, ['outer', outer]]) };
  const result = resolveBoard(
    layer('board', {
      layers: [
        layer('i', {
          _class: 'symbolInstance',
          symbolID: 'outer',
          overrideValues: [{ overrideName: 'nested_symbolID', value: '' }],
        }),
      ],
    }),
    library,
  );
  assert.equal(result.root.layers![0].layers![0]._hiddenSymbol, true);
});
test('cycle protection prevents an infinite component expansion', () => {
  const cyclic = layer('m', {
    _class: 'symbolMaster',
    symbolID: 'loop',
    layers: [layer('i', { _class: 'symbolInstance', symbolID: 'loop' })],
  });
  const result = resolveBoard(
    layer('board', { layers: [layer('i', { _class: 'symbolInstance', symbolID: 'loop' })] }),
    { symbols: new Map([['loop', cyclic]]) },
  );
  assert.ok(result.warnings.some((w) => w.includes('循环引用')));
});
test('fixed dimensions preserve font frames while flexible dimensions stretch', () => {
  assert.deepEqual(
    resizeFrame(frame(10, 20, 30, 40), frame(), frame(0, 0, 200, 200), 45),
    frame(35, 60, 30, 40),
  );
  assert.deepEqual(
    resizeFrame(frame(10, 20, 30, 40), frame(), frame(0, 0, 200, 200), 63),
    frame(20, 40, 60, 80),
  );
  const leftRightFixed = 63 ^ 1 ^ 4;
  assert.equal(
    resizeFrame(frame(10, 0, 80, 10), frame(), frame(0, 0, 200, 100), leftRightFixed).width,
    180,
  );
});
test('mask chain terminates at break, is local, and ignores hidden masks', () => {
  const m = layer('mask', { hasClippingMask: true });
  const result = maskChains([
    m,
    layer('image'),
    layer('break', { shouldBreakMaskChain: true }),
    layer('hidden', { hasClippingMask: true, isVisible: false }),
    layer('last'),
  ]);
  assert.equal(result[0].mask, null);
  assert.equal(result[1].mask, m);
  assert.equal(result[2].mask, null);
  assert.equal(result[3].mask, null);
  assert.equal(maskChains([layer('new-parent')])[0].mask, null);
});
test('outline masks contain direct SVG geometry and unique references', () => {
  const m = layer('mask', { hasClippingMask: true, frame: frame(10, 20, 50, 50) });
  const markup = renderToStaticMarkup(
    React.createElement(
      'svg',
      null,
      React.createElement(Children, {
        layers: [m, layer('image'), layer('after', { shouldBreakMaskChain: true })],
        doc: {} as SketchDocument,
        choose: () => {},
        w: 100,
        h: 100,
      }),
    ),
  );
  assert.match(markup, /<clipPath[^>]+clipPathUnits="userSpaceOnUse"><path/);
  assert.doesNotMatch(markup, /<clipPath[^>]*><g/);
  assert.match(markup, /translate\(10 20\)/);
  const ids = [...markup.matchAll(/ id="([^"]+)"/g)].map((x) => x[1]);
  assert.equal(new Set(ids).size, ids.length);
});
test('rich text keeps ranges, uncovered text, and UTF-16 offsets', () => {
  const l = layer('text', {
    _class: 'text',
    attributedString: {
      string: 'A😀BC',
      attributes: [
        { location: 1, length: 2, attributes: { kerning: 2 } },
        { location: 3, length: 2, attributes: { kerning: 4 } },
      ],
    },
  });
  const runs = textRuns(l);
  assert.deepEqual(
    runs.map((r) => r.text),
    ['A', '😀', 'BC'],
  );
  assert.equal(runs[1].attributes.kerning, 2);
  assert.equal(runs[2].attributes.kerning, 4);
});
function area(l: Layer) {
  const item = new paper.CompoundPath({ pathData: geometry(l), insert: false });
  const result = Math.abs(item.area);
  item.remove();
  return result;
}
test('union, subtract, intersection and xor have the expected area', () => {
  for (const [operation, expected] of [
    [0, 15000],
    [1, 5000],
    [2, 5000],
    [3, 10000],
  ]) {
    const group = layer('g', {
      _class: 'shapeGroup',
      layers: [layer('a'), layer('b', { frame: frame(50, 0), booleanOperation: operation })],
    });
    assert.ok(Math.abs(area(group) - expected) < 0.001, `operation ${operation}`);
  }
});
test('compound contours preserve opposite winding instead of filling holes', () => {
  const outer = layer('outer', {
    _class: 'shapePath',
    isClosed: true,
    points: ['{0,0}', '{1,0}', '{1,1}', '{0,1}'].map((point) => ({ point })),
  });
  const inner = layer('inner', {
    _class: 'shapePath',
    frame: frame(25, 25, 50, 50),
    booleanOperation: -1,
    isClosed: true,
    points: ['{0,0}', '{0,1}', '{1,1}', '{1,0}'].map((point) => ({ point })),
  });
  const group = layer('ring', { _class: 'shapeGroup', windingRule: 0, layers: [outer, inner] });
  const item = new paper.CompoundPath({
    pathData: geometry(group),
    insert: false,
    fillRule: fillRule(group),
  });
  assert.equal(Math.abs(item.area), 7500);
  assert.equal(item.contains(new paper.Point(50, 50)), false);
  assert.equal(item.contains(new paper.Point(10, 50)), true);
  item.remove();
  // An explicit union must still fill the hole.
  const union = { ...group, layers: [outer, { ...inner, booleanOperation: 0 }] };
  assert.equal(area(union), 10000);
});
test('even-odd compound contours keep holes regardless of their direction', () => {
  const group = layer('ring', {
    _class: 'shapeGroup',
    windingRule: 1,
    style: { windingRule: 0 },
    layers: [
      layer('outer'),
      layer('inner', { frame: frame(25, 25, 50, 50), booleanOperation: -1 }),
    ],
  });
  const item = new paper.CompoundPath({
    pathData: geometry(group),
    insert: false,
    fillRule: fillRule(group),
  });
  assert.equal(fillRule(group), 'evenodd');
  assert.equal(item.contains(new paper.Point(50, 50)), false);
  item.remove();
});
test('boolean geometry uses child rotations and flips', () => {
  const group = layer('g', {
    _class: 'shapeGroup',
    layers: [
      layer('a'),
      layer('b', {
        frame: frame(100, 0, 100, 100),
        rotation: 180,
        isFlippedHorizontal: true,
        booleanOperation: 0,
      }),
    ],
  });
  assert.ok(Math.abs(area(group) - 20000) < 0.001);
});
test('round corners and bezier ellipses keep their geometry', () => {
  assert.ok(Math.abs(area(layer('r', { fixedRadius: 10 })) - (10000 - (4 - Math.PI) * 100)) < 0.1);
  assert.ok(Math.abs(area(layer('o', { _class: 'oval' })) - Math.PI * 2500) < 3);
});
test('individual rectangle corners preserve different radii', () => {
  const points = ['{0,0}', '{1,0}', '{1,1}', '{0,1}'].map((point, i) => ({
    point,
    cornerRadius: [10, 20, 0, 5][i],
  }));
  const expected = 10000 - (1 - Math.PI / 4) * (100 + 400 + 25);
  // Paper converts circular arcs into cubic curves; allow its small area approximation.
  assert.ok(Math.abs(area(layer('r', { points })) - expected) < 0.2);
});

test(
  'real Sketch: every page and artboard resolves with unique instance IDs',
  { skip: !existsSync('fu-h5.sketch') },
  async () => {
    const doc = new SketchDocument(new File([await openAsBlob('fu-h5.sketch')], 'fu-h5.sketch'));
    try {
      await doc.open();
      await doc.loadSymbols();
      assert.equal(doc.pages.length, 8);
      assert.ok(doc.symbols.size >= 258);
      const search = [...doc.symbols.values()].find((l) => l.name === 'topbar/搜索');
      assert.ok(search);
      const contours: Layer[] = [];
      function findRing(l: Layer) {
        if (l.name === 'Oval 2') contours.push(l);
        l.layers?.forEach(findRing);
      }
      findRing(search!);
      assert.equal(contours.length, 1);
      const ring = contours[0],
        ringPath = new paper.CompoundPath({
          pathData: geometry(ring),
          insert: false,
          fillRule: fillRule(ring),
        });
      assert.equal(
        ringPath.contains(new paper.Point(8.4, 8.4)),
        false,
        'reported search icon must have an empty center',
      );
      assert.equal(
        ringPath.contains(new paper.Point(0.9, 8.4)),
        true,
        'reported search icon must retain its rim',
      );
      assert.ok(Math.abs(Math.abs(ringPath.area) - Math.PI * (8.4 ** 2 - 6.6 ** 2)) < 0.1);
      ringPath.remove();
      let boards = 0,
        instances = 0,
        overrides = 0,
        masks = 0,
        shapes = 0;
      for (const page of doc.pages) {
        const p = await doc.page(page.id);
        for (const board of p.layers || []) {
          if (board._class !== 'artboard') continue;
          boards++;
          const resolved = resolveBoard(board, doc);
          const ids = new Set<string>();
          function visit(l: Layer) {
            assert.ok(!ids.has(l.do_objectID));
            ids.add(l.do_objectID);
            if (l._class === 'shapeGroup') {
              const d = geometry(l);
              assert.ok(!/NaN|Infinity/.test(d));
              shapes++;
            }
            l.layers?.forEach(visit);
          }
          visit(resolved.root);
          instances += resolved.stats.instances;
          overrides += resolved.stats.overrides;
          masks += resolved.stats.masks;
        }
      }
      assert.equal(boards, 343);
      assert.ok(instances > 2000);
      assert.ok(overrides > 500);
      assert.ok(masks > 400);
      console.log(
        JSON.stringify({ boards, instances, overrides, masks, shapes, masters: doc.symbols.size }),
      );
    } finally {
      await doc.close();
    }
  },
);

test('auto-width time labels keep their complete line while fixed text retains wrapping', () => {
  const render = (textBehaviour: number) =>
    renderToStaticMarkup(
      React.createElement(
        'svg',
        null,
        React.createElement(Children, {
          layers: [
            layer('time', {
              _class: 'text',
              textBehaviour,
              frame: frame(0, 0, 120, 22),
              attributedString: { string: '11:00 ~ 12:20', attributes: [] },
            }),
          ],
          doc: {} as SketchDocument,
          choose: () => {},
          w: 200,
          h: 100,
        }),
      ),
    );
  const auto = render(0),
    fixed = render(1);
  assert.match(auto, /11:00 ~ 12:20/);
  assert.match(auto, /white-space:pre;/);
  assert.match(auto, /width:max-content/);
  assert.match(auto, /overflow:visible/);
  assert.match(fixed, /white-space:pre-wrap/);
  assert.match(fixed, /overflow-wrap:break-word/);
  assert.doesNotMatch(fixed, /width:max-content/);
});
