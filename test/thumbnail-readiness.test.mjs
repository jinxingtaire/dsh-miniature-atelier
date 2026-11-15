import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import {runInNewContext} from 'node:vm';

const source = await fs.readFile(new URL('../src/client.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('function coverHasDetail('), source.indexOf('function captureAssetThumbnail('));

test('cover capture skips smooth gradients and detached render targets before saving a rendered model', () => {
  const messages = [];
  let tick;
  const fakeCanvas = function () {};
  const calls = [];
  fakeCanvas.prototype.getContext = function (type, options) {
    calls.push({type, options});
    return {};
  };
  const sample = {
    getContext: () => ({
      drawImage(canvas) { sample.source = canvas; },
      getImageData() { return { data: sample.source.data }; },
    }),
    toDataURL: () => 'data:image/webp;base64,bW9kZWw=',
  };
  const bitmap = new fakeCanvas();
  bitmap.width = bitmap.clientWidth = 1000;
  bitmap.height = bitmap.clientHeight = 680;
  bitmap.isConnected = true;
  bitmap.getBoundingClientRect = () => ({top:0,left:0,right:1000,bottom:680,width:1000,height:680});
  bitmap.data = new Uint8ClampedArray(64 * 64 * 4);
  for (let pixel = 0; pixel < 64 * 64; pixel++) {
    bitmap.data.fill(122 + Math.floor(pixel / 64), pixel * 4, pixel * 4 + 3);
    bitmap.data[pixel * 4 + 3] = 255;
  }

  const context = {
    HTMLCanvasElement: fakeCanvas, document: {createElement: () => sample},
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { tick = null; },
    window:{}, innerWidth:1000, innerHeight:680,
    parent:{postMessage(message) { messages.push(message); }},
  };
  runInNewContext(helpers + '\ncaptureCoverFrame("cover", coverHasDetail);', context);
  bitmap.getContext('webgl2');
  assert.equal(calls.at(-1).options.preserveDrawingBuffer, true);
  tick();
  assert.equal(messages.length, 0, 'background gradient is not a valid cover');

  for (let y = 20; y < 44; y++) {
    for (let x = 20; x < 44; x++) {
      const p = (y * 64 + x) * 4;
      bitmap.data.fill((x + y) % 2 ? 230 : 28, p, p + 3);
    }
  }
  bitmap.isConnected = false;
  tick();
  assert.equal(messages.length, 0, 'offscreen WebGL textures are not covers');
  bitmap.isConnected = true;
  tick();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].token, 'cover');
  assert.equal(tick, null);
});
