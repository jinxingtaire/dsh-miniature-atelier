import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import vm from 'node:vm'

const three = await fs.readFile(new URL('../src/three.min.js', import.meta.url), 'utf8')
const lens = await fs.readFile(new URL('../src/lens-runtime.js', import.meta.url), 'utf8')

// Classic-script page order: lens (in <head>) -> engine -> scene script.
function page() {
  let clock = 0
  const listeners = {}
  const window = {
    performance: { now: () => clock },
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn) },
    setTimeout: () => 0,
    document: { readyState: 'complete', body: null },
    console: { warn() {}, error() {}, log() {} },
  }
  window.window = window; window.self = window; window.globalThis = window; window.parent = window
  const context = vm.createContext(window)
  vm.runInContext(lens, context)
  vm.runInContext(three, context)
  return {
    window, context,
    advance(ms) { clock += ms },
    // Render at ~60fps for `ms` milliseconds, the way a real page drives the lens.
    play(s, ms) { let seen; for (let t = 0; t < ms; t += 16) { clock += 16; seen = s.frame() } return seen },
    send(data, source = window.parent) { for (const fn of listeners.message || []) fn({ data, source }) },
    run(code) { return vm.runInContext(code, context) },
  }
}

const sceneCode = `
  var T = THREE, scene = new T.Scene(), root = new T.Group();
  var box = new T.Mesh(new T.BoxGeometry(20, 10, 20), new T.MeshBasicMaterial());
  root.add(box); scene.add(root); window.__MA_MODEL_ROOT__ = root;
  var camera = new T.PerspectiveCamera(35, 1.6, 1, 1000);
  camera.position.set(60, 50, 60); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  var renderer = { domElement: { width: 1600, height: 1000 } };
  function frame(fn) {
    scene.onBeforeRender(renderer, scene, camera, null);
    var seen = fn ? fn(camera) : camera.projectionMatrix.clone();
    scene.onAfterRender(renderer, scene, camera);
    return seen;
  }
  function project(m, p) { return new T.Vector3().copy(p).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(m); }
  ({ T, camera, frame, project });
`

test('lens patches THREE after the UMD engine loads and starts in perspective', async () => {
  const p = page()
  await Promise.resolve()
  const s = p.run(sceneCode)
  assert.equal(p.window.__MA_LENS__.state().supported, true)
  assert.equal(p.window.__MA_LENS__.mode(), 'perspective')
  const seen = s.frame()
  assert.deepEqual(Array.from(seen.elements), Array.from(s.camera.projectionMatrix.elements))
})

test('orthographic blend keeps the focus-plane size and restores the scene camera', async () => {
  const p = page()
  await Promise.resolve()
  const s = p.run(sceneCode)
  const original = s.camera.projectionMatrix.clone()
  // The edge sits on the focus plane (camera-right of the model centre), where the dolly keeps size exact.
  const centre = new s.T.Vector3(0, 0, 0), edge = new s.T.Vector3().setFromMatrixColumn(s.camera.matrixWorld, 0).multiplyScalar(10)
  const width = (m) => { const a = s.project(m, centre), b = s.project(m, edge); return Math.hypot(a.x - b.x, a.y - b.y) }
  const reference = width(original)

  p.send({ type: 'ma-lens', mode: 'orthographic' })
  s.frame()
  const mid = p.play(s, 370)
  const ortho = p.play(s, 1000)

  assert.equal(p.window.__MA_LENS__.mode(), 'orthographic')
  assert.ok(Math.abs(mid.elements[11]) < 1 && Math.abs(mid.elements[11]) > 1e-6, 'mid-transition is a partial perspective')
  assert.ok(Math.abs(ortho.elements[11]) <= 1e-5, 'fully switched lens has no perspective divide')
  assert.ok(Math.abs(width(mid) - reference) / reference < 0.01, 'model size is stable while blending')
  assert.ok(Math.abs(width(ortho) - reference) / reference < 0.01, 'model size is stable when orthographic')
  // Parallel lines stay parallel: equal offsets at different depths project equally.
  const near = new s.T.Vector3(0, 0, 0), far = new s.T.Vector3(-30, 0, -30)
  const step = (m, q) => { const a = s.project(m, q), b = s.project(m, q.clone().add(new s.T.Vector3(0, 5, 0))); return b.y - a.y }
  assert.ok(Math.abs(step(ortho, near) - step(ortho, far)) < 1e-4)
  assert.deepEqual(Array.from(s.camera.projectionMatrix.elements), Array.from(original.elements), 'scene code still sees its own camera')

  p.send({ type: 'ma-lens', mode: 'toggle' })
  s.frame()
  assert.deepEqual(Array.from(p.play(s, 1000).elements), Array.from(original.elements), 'toggling back returns to pure perspective')
})

test('the lens does not touch offscreen cameras with a different projection', async () => {
  const p = page()
  await Promise.resolve()
  const s = p.run(sceneCode)
  p.send({ type: 'ma-lens', mode: 'orthographic' })
  s.frame(); p.play(s, 1000)
  const other = p.run(`(function(){ var c = new THREE.PerspectiveCamera(90, 1, 0.1, 10); c.updateMatrixWorld();
    var before = c.projectionMatrix.clone(); var seen;
    var sc = new THREE.Scene(); sc.onBeforeRender({ domElement: { width: 256, height: 256 } }, sc, c, {});
    seen = c.projectionMatrix.clone(); sc.onAfterRender({}, sc, c); return [before, seen]; })()`)
  assert.deepEqual(Array.from(other[1].elements), Array.from(other[0].elements))
})

test('copied reflection projections stay unchanged throughout both lens transitions', async () => {
  for (const hasModelRoot of [true, false]) {
    const p = page()
    await Promise.resolve()
    const s = p.run(sceneCode)
    if (!hasModelRoot) p.run('delete window.__MA_MODEL_ROOT__')
    const probe = p.run(`(function () {
      var offscreenScene = new T.Scene(), target = {};
      var mirror = camera.clone(), secondary = camera.clone();
      mirror.matrixWorld.makeScale(1, -1, 1);
      mirror.matrixWorldInverse.copy(mirror.matrixWorld).invert();
      return function () {
        return [mirror, secondary].map(function (c) {
          c.projectionMatrix.copy(camera.projectionMatrix);
          c.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
          var before = c.projectionMatrix.clone(), inverse = c.projectionMatrixInverse.clone();
          // A planar reflector caches this lookup before calling renderer.render().
          var lookup = before.clone().multiply(c.matrixWorldInverse);
          offscreenScene.onBeforeRender(renderer, offscreenScene, c, target);
          var during = c.projectionMatrix.clone();
          var duringInverse = c.projectionMatrixInverse.clone();
          var duringLookup = during.clone().multiply(c.matrixWorldInverse);
          offscreenScene.onAfterRender(renderer, offscreenScene, c);
          return [before, during, inverse, duringInverse, lookup, duringLookup];
        });
      };
    })()`)
    s.frame()
    for (const mode of ['orthographic', 'perspective']) {
      p.send({ type: 'ma-lens', mode })
      for (let i = 0; i < 55; i++) {
        p.advance(16)
        for (const matrices of probe()) {
          for (const [expected, actual] of [[0, 1], [2, 3], [4, 5]]) {
            assert.deepEqual(Array.from(matrices[actual].elements), Array.from(matrices[expected].elements),
              `${mode}, frame ${i}, root=${hasModelRoot}: offscreen render and cached lookup agree`)
          }
        }
        s.frame()
      }
    }
  }
})


test('visible preview cover uses the fitted main frame and only accepts requests from its parent', async () => {
  const p = page(); await Promise.resolve(); const s = p.run(sceneCode);
  const replies = []; const parent = { postMessage: data => replies.push(data) }; p.window.parent = parent;
  p.run("renderer.domElement.toDataURL = function(){return 'data:image/webp;base64,bW9kZWw='}");
  p.send({ type: 'ma-thumbnail-request', token: 'untrusted' }, {}); s.frame();
  assert.equal(replies.length, 0);
  p.send({ type: 'ma-thumbnail-request', token: 'current-frame' }, parent);
  s.frame(); s.frame();
  assert.equal(replies.length, 1, 'capture runs once without reloading or changing the scene');
  assert.equal(replies[0].type, 'ma-thumbnail-result'); assert.equal(replies[0].token, 'current-frame');
  assert.equal(replies[0].image, 'data:image/webp;base64,bW9kZWw=');
});
