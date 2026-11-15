/* Miniature Atelier lens: smooth perspective <-> orthographic blend.
 * Injected at preview/download time only (never into the agent QA package,
 * which must stay UI-free). Works with any classic-script THREE scene: it
 * blends the main PerspectiveCamera's projection inside Scene.onBeforeRender
 * and restores it in onAfterRender, so scene logic, fit code and raycasts keep
 * seeing their own perspective matrix.
 *
 * Blend: an "infinite dolly" done in clip space. Perspective strength k goes
 * 1 -> 0; equivalent extra camera distance c = d(1-k)/k; matrix weight
 * t = c / (1 + c). Object size on the focus plane (model centre) is constant
 * for every t, so the model never jumps in size while the perspective drains.
 */
(function () {
  if (window.__MA_LENS__) return;
  var OPTIONS = window.__MA_LENS_OPTIONS__ || {};
  var DURATION = 0.75;
  var state = { target: 0, s: 0, last: null, patched: false, main: null, mainNull: false,
    thumbnailRequest: null, focus: 0, root: null, center: null, radius: 0, saved: null, base: null, blended: null };

  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  function patchPoints(T) {
    // PointsMaterial loses size attenuation once m[2][3] != -1; keep it while blending.
    var from = 'if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );';
    var to = 'if ( isPerspective || projectionMatrix[ 2 ][ 3 ] < 0.0 ) gl_PointSize *= ( scale / - mvPosition.z );';
    try {
      if (T.ShaderChunk && typeof T.ShaderChunk.points_vert === 'string') T.ShaderChunk.points_vert = T.ShaderChunk.points_vert.replace(from, to);
      if (T.ShaderLib && T.ShaderLib.points) T.ShaderLib.points.vertexShader = T.ShaderLib.points.vertexShader.replace(from, to);
    } catch (e) {}
  }

  function modelScene() {
    var root = window.__MA_MODEL_ROOT__;
    if (!root || !root.isObject3D) return null;
    var top = root;
    while (top.parent) top = top.parent;
    return top.isScene ? top : null;
  }

  function measure(T) {
    var root = window.__MA_MODEL_ROOT__;
    if (root && root.isObject3D) {
      if (root !== state.root) {
        state.root = root;
        try {
          var box = new T.Box3().setFromObject(root);
          if (!box.isEmpty()) {
            state.center = box.getCenter(new T.Vector3());
            state.radius = box.getSize(new T.Vector3()).length() / 2;
          }
        } catch (e) { state.center = null; }
      }
    }
  }

  function focusDepth(T, camera) {
    var p = state.center ? state._v.copy(state.center) : state._v.set(0, 0, 0);
    p.applyMatrix4(camera.matrixWorldInverse);
    return -p.z;
  }

  function blend(T, camera, d, t) {
    var P = camera.projectionMatrix.elements;
    var B = state.base || (state.base = new Float32Array(16));
    for (var i = 0; i < 16; i++) B[i] = P[i];
    var n = P[14] / (P[10] - 1), f = P[14] / (P[10] + 1);
    if (!(n > 0) || !(f > n)) return false;
    d = Math.max(d, n * 1.5);
    var O = state._o.elements;
    for (i = 0; i < 16; i++) O[i] = 0;
    O[0] = P[0] / d; O[5] = P[5] / d; O[12] = -P[8]; O[13] = -P[9];
    O[10] = -2 / (f - n); O[14] = -(f + n) / (f - n); O[15] = 1;
    var M = state._m.elements;
    for (i = 0; i < 16; i++) M[i] = (1 - t) * P[i] + t * O[i];
    // Keep m[2][3] infinitesimally negative so attenuated points stay continuous;
    // isPerspectiveMatrix() is false, so log depth / sprites take the linear path.
    if (M[11] > -1e-6) M[11] = -1e-6;
    return true;
  }

  function install(T) {
    if (state.patched || !T || !T.Scene || !T.Matrix4) return;
    state.patched = true;
    state._v = new T.Vector3(); state._o = new T.Matrix4(); state._m = new T.Matrix4(); state._inv = new T.Matrix4();
    state._det = new T.Matrix4();
    patchPoints(T);
    var proto = T.Scene.prototype;
    var prevBefore = proto.onBeforeRender, prevAfter = proto.onAfterRender;
    proto.onBeforeRender = function (renderer, scene, camera, target) {
      try { before(T, renderer, scene, camera, target); } catch (e) {}
      return prevBefore && prevBefore.apply(this, arguments);
    };
    proto.onAfterRender = function (renderer, scene, camera) {
      try { after(camera); } catch (e) {}
      if (state.thumbnailRequest && camera === state.main && renderer?.domElement) {
        var request = state.thumbnailRequest; state.thumbnailRequest = null;
        try { request.source.postMessage({ type: 'ma-thumbnail-result', token: request.token, image: renderer.domElement.toDataURL('image/webp', 0.85) }, '*'); } catch (e) {}
      }
      return prevAfter && prevAfter.apply(this, arguments);
    };
    announce();
  }

  function tick(now) {
    var dt = state.last != null ? Math.min(0.1, (now - state.last) / 1000) : 0;
    state.last = now;
    var step = dt / DURATION;
    if (state.s < state.target) state.s = Math.min(state.target, state.s + step);
    else if (state.s > state.target) state.s = Math.max(state.target, state.s - step);
  }

  function before(T, renderer, scene, camera, target) {
    if (!camera || !camera.isPerspectiveCamera) return;
    var rootScene = modelScene();
    // Only the main camera is blended. Mirror/reflection cameras keep their own
    // projection: scenes derive their sampling matrix from it before rendering,
    // so swapping it here would desync the reflection texture from its lookup.
    if (rootScene && scene !== rootScene) return;
    var mirrored = camera.matrixWorld.determinant() < 0;
    var canvas = renderer && renderer.domElement;
    var aspectOk = !canvas || !canvas.height || Math.abs(camera.aspect - canvas.width / canvas.height) < 0.06;
    if (!mirrored && aspectOk) {
      if (target === null) { if (state.main !== camera) state.main = camera; state.mainNull = true; }
      else if (!state.mainNull) state.main = camera;
    }
    if (camera !== state.main) return;
    tick(performance.now());
    measure(T);
    var k = 1 - ease(state.s);
    if (state.s <= 0) { state.blended = null; return; }
    var d = focusDepth(T, camera);
    state.focus = d;
    var c = k <= 1e-6 ? Infinity : d * (1 - k) / k;
    var t = c === Infinity ? 1 : c / (1 + c);
    if (!blend(T, camera, d, t)) { state.blended = null; return; }
    state.blended = state._m;
    apply(camera, state._m);
  }

  var saved = [];
  function apply(camera, matrix) {
    saved.push({ camera: camera, p: camera.projectionMatrix.clone(), i: camera.projectionMatrixInverse.clone() });
    camera.projectionMatrix.copy(matrix);
    camera.projectionMatrixInverse.copy(matrix).invert();
  }

  function after(camera) {
    for (var i = saved.length - 1; i >= 0; i--) {
      if (saved[i].camera === camera) {
        camera.projectionMatrix.copy(saved[i].p);
        camera.projectionMatrixInverse.copy(saved[i].i);
        saved.splice(i, 1);
        return;
      }
    }
  }

  function mode() { return state.target ? 'orthographic' : 'perspective'; }
  function announce() {
    var payload = { type: 'ma-lens-state', mode: mode(), supported: state.patched, progress: state.s };
    try { if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*'); } catch (e) {}
    syncButton();
  }
  function set(next) {
    state.target = next === 'orthographic' || next === 'ortho' || next === 1 ? 1 : 0;
    announce();
    return mode();
  }
  function toggle() { return set(state.target ? 'perspective' : 'orthographic'); }

  // Trap the UMD build's `globalThis.THREE = {}`; patch once it has been filled
  // (microtask checkpoint runs after the engine script, before the scene script).
  var existing = window.THREE;
  if (existing) install(existing);
  else {
    var holder;
    try {
      Object.defineProperty(window, 'THREE', { configurable: true, enumerable: true,
        get: function () { return holder; },
        set: function (value) { holder = value; Promise.resolve().then(function () { install(holder); }); } });
    } catch (e) {}
    var tries = 0;
    (function poll() { if (state.patched) return; install(window.THREE); if (!state.patched && ++tries < 600) setTimeout(poll, 50); })();
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data) return;
    if (data.type === 'ma-thumbnail-request' && event.source === window.parent && typeof data.token === 'string') {
      state.thumbnailRequest = { source: event.source, token: data.token }; return;
    }
    if (data.type !== 'ma-lens') return;
    if (data.mode === 'toggle') toggle(); else if (data.mode) set(data.mode); else announce();
  });
  window.addEventListener('keydown', function (event) {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    var tag = event.target && event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (event.key === 'o' || event.key === 'O') toggle();
  });

  var button = null;
  function syncButton() {
    if (!button) return;
    var ortho = !!state.target;
    button.setAttribute('aria-pressed', ortho ? 'true' : 'false');
    button.children[0].className = ortho ? '' : 'on';
    button.children[1].className = ortho ? 'on' : '';
  }
  function mountButton() {
    if (!OPTIONS.ui || button || !document.body) return;
    var style = document.createElement('style');
    style.textContent = '.ma-lens{position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:2px;padding:3px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(12,16,22,.55);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);font:500 12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;cursor:pointer;user-select:none;-webkit-user-select:none;touch-action:manipulation}.ma-lens span{padding:7px 11px;border-radius:999px;color:rgba(255,255,255,.62);transition:background .25s,color .25s}.ma-lens span.on{background:rgba(255,255,255,.9);color:#10141a}';
    document.head.appendChild(style);
    button = document.createElement('div');
    button.className = 'ma-lens';
    button.setAttribute('role', 'button');
    button.setAttribute('tabindex', '0');
    button.title = '透视 / 正交（快捷键 O）';
    button.innerHTML = '<span class="on">透视</span><span>正交</span>';
    ['pointerdown', 'mousedown', 'touchstart', 'wheel', 'dblclick'].forEach(function (name) {
      button.addEventListener(name, function (event) { event.stopPropagation(); }, { passive: true });
    });
    button.addEventListener('click', function (event) { event.stopPropagation(); toggle(); });
    button.addEventListener('keydown', function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); toggle(); } });
    document.body.appendChild(button);
    syncButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountButton); else mountButton();

  window.__MA_LENS__ = { set: set, toggle: toggle, mode: mode,
    state: function () { return { mode: mode(), progress: state.s, eased: ease(state.s), supported: state.patched, focus: state.focus, hasRoot: !!state.root }; } };
})();
