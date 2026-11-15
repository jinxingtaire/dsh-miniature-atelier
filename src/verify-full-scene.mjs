import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
export const offlinePolicy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; font-src 'none'; media-src 'none'; worker-src blob:; base-uri 'none'; form-action 'none'"

const inspector = `(function(){var Original=THREE.WebGLRenderer;var state=window.__MA_INSPECT__={frames:0,implicitMaterials:new WeakSet()};function TrackedRenderer(){var renderer=new Original(...arguments);var render=renderer.render;renderer.render=function(scene,camera){state.scene=scene;state.camera=camera;state.renderer=renderer;state.frames++;return render.apply(renderer,arguments);};return renderer;}TrackedRenderer.prototype=Original.prototype;Object.setPrototypeOf(TrackedRenderer,Original);THREE.WebGLRenderer=TrackedRenderer;['Mesh','InstancedMesh'].forEach(function(name){var Mesh=THREE[name];function TrackedMesh(){var args=Array.from(arguments);var object=Reflect.construct(Mesh,args,new.target===TrackedMesh?Mesh:new.target);if(args[0]&&args[1]===undefined)state.implicitMaterials.add(object.material);return object;}TrackedMesh.prototype=Mesh.prototype;Object.setPrototypeOf(TrackedMesh,Mesh);THREE[name]=TrackedMesh;});})();`

export async function packageScene(directory, engine) {
  const code = await fs.readFile(path.join(directory, 'scene.js'), 'utf8')
  if (code.length < 2000 || code.length > 2_000_000) throw new Error('scene.js 不完整或过大')
  // Syntax-check without evaluating generated code in the host process.
  new Function(code)
  const safe = (text) => text.replace(/<\/script/gi, '<\\/script')
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${offlinePolicy}"><title>Miniature</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#101216}canvas{display:block;touch-action:none}</style></head><body><script>${safe(engine)}</script><script>${inspector}</script><script>${safe(code)}</script></body></html>`
  const output = path.join(directory, 'scene.html')
  await fs.writeFile(output, html)
  return { output, html, hash: createHash('sha256').update(html).digest('hex') }
}

export function resolvePlaywright() {
  const roots = [process.env.DSH_WORKSPACE_NODE_MODULES,
    path.join(os.homedir(), '.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/node/node_modules'),
    '/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/node/node_modules',
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules')].filter(Boolean)
  for (const root of roots) {
    try { return require(path.join(root, 'playwright')) } catch {}
  }
  try { return require('playwright') } catch {}
  throw new Error('没有找到本机 Playwright，不能跳过浏览器验收后宣称制作完成')
}

export async function verifyFullScene(directory, engine, { signal, showcase = true } = {}) {
  const packaged = await packageScene(directory, engine)
  const { chromium } = resolvePlaywright()
  const chromePaths = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/chromium']
  let executablePath
  for (const candidate of chromePaths) { try { await fs.access(candidate); executablePath = candidate; break } catch {} }
  const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}), headless: true,
    args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader'] })
  const abort = () => { void browser.close().catch(() => {}) }
  signal?.addEventListener('abort', abort, { once: true })
  const report = { hash: packaged.hash, checks: {}, errors: [], external: [], views: [], createdAt: Date.now() }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 })
  const snapshot = () => page.evaluate(() => {
    const s = window.__MA_INSPECT__, T = window.THREE, root = window.__MA_MODEL_ROOT__
    if (!s?.camera || !s.renderer || !root?.isObject3D) throw new Error('缺少已渲染相机或 __MA_MODEL_ROOT__ 模型根节点')
    const ndc = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
    const view = new T.Matrix4().multiplyMatrices(s.camera.projectionMatrix, s.camera.matrixWorldInverse)
    const p = new T.Vector3(), instance = new T.Matrix4(), transform = new T.Matrix4()
    const implicitMaterialObjects = []
    root.updateWorldMatrix(true, true)
    // Project real vertices: projecting a single global AABB invents empty high
    // corners and incorrectly rejects cutaways whose real silhouette fits.
    root.traverseVisible((object) => {
      const positions = object.geometry?.attributes?.position
      if (!positions || object.material?.isShadowMaterial) return
      if (s.implicitMaterials.has(object.material)) implicitMaterialObjects.push(object.name || object.uuid)
      const count = object.isInstancedMesh ? object.count : 1
      for (let j = 0; j < count; j++) {
        transform.multiplyMatrices(view, object.matrixWorld)
        if (object.isInstancedMesh) { object.getMatrixAt(j, instance); transform.multiply(instance) }
        for (let i = 0; i < positions.count; i++) {
          const alpha = object.geometry.attributes.aAlpha || object.geometry.attributes.alpha
          if (alpha?.itemSize === 1 && alpha.getX(i) <= 0.001) continue
          p.fromBufferAttribute(positions, i).applyMatrix4(transform)
          ndc.minX = Math.min(ndc.minX, p.x); ndc.maxX = Math.max(ndc.maxX, p.x)
          ndc.minY = Math.min(ndc.minY, p.y); ndc.maxY = Math.max(ndc.maxY, p.y)
        }
      }
    })
    let shadowLights = 0, meshes = 0
    s.scene.traverse((o) => { if (o.isLight && o.castShadow) shadowLights++; if (o.isMesh) meshes++ })
    return { camera: [...s.camera.matrixWorld.elements, s.camera.zoom], ndc, meshes, shadowLights,
      implicitMaterials: implicitMaterialObjects.length, implicitMaterialObjects: implicitMaterialObjects.slice(0, 12),
      revision: T.REVISION, frames: s.frames, calls: s.renderer.info.render.calls, triangles: s.renderer.info.render.triangles,
      pixels: [s.renderer.domElement.width, s.renderer.domElement.height], pixelRatio: s.renderer.getPixelRatio(),
      text: document.body.innerText.trim(), controls: document.querySelectorAll('button,input,select,textarea,a,[role="button"]').length }
  })
  const moved = (a, b) => {
    const distance = Math.hypot(a.camera[12], a.camera[13], a.camera[14])
    return a.camera.some((n, i) => Math.abs(n - b.camera[i]) > (i >= 12 && i <= 14 ? Math.max(0.01, distance * 0.0015) : 0.003))
  }
  const fits = (s) => Object.values(s.ndc).every(Number.isFinite) && s.ndc.minX >= -0.99 && s.ndc.maxX <= 0.99 && s.ndc.minY >= -0.99 && s.ndc.maxY <= 0.99
  const pause = (ms) => page.waitForTimeout(ms)
  page.on('pageerror', (error) => report.errors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') report.errors.push(message.text()) })
  page.on('request', (request) => { if (!/^(file|data|blob):/.test(request.url())) report.external.push(request.url()) })
  try {
    signal?.throwIfAborted()
    await page.goto(pathToFileURL(packaged.output).href, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForFunction(() => window.__MA_INSPECT__?.frames > 2, null, { timeout: 90000 })
    await pause(500)
    const initial = await snapshot()
    const desktopPath = path.join(directory, '1600x1000.png')
    await page.screenshot({ path: desktopPath })
    const thumb = await page.screenshot({ type: 'jpeg', quality: 65 })
    report.thumbnail = 'data:image/jpeg;base64,' + thumb.toString('base64')
    report.views.push({ width: 1600, height: 1000, screenshot: desktopPath, ...initial })
    report.checks.desktopFits = fits(initial)
    report.checks.revision160 = initial.revision === '160'
    report.checks.pixelRatio = initial.pixelRatio <= 1.75
    report.checks.noUI = !initial.text && !initial.controls
    report.checks.shadowLights = initial.shadowLights <= 2
    report.checks.explicitMaterials = initial.implicitMaterials === 0
    await pause(5200)
    const automatic = await snapshot()
    report.checks.animation = automatic.frames > initial.frames + 5
    report.checks.autoOrbit = showcase ? moved(initial, automatic) : !moved(initial, automatic)
    await page.mouse.move(800, 500); await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(800 + i * 12, 500 + i * 2)
    await page.mouse.up(); await pause(650)
    const drag = await snapshot()
    report.checks.drag = moved(automatic, drag)
    await page.mouse.wheel(0, -240); await pause(700)
    const wheel = await snapshot()
    report.checks.wheel = moved(drag, wheel)
    await page.mouse.dblclick(800, 500)
    // Damped controls may need more frames when another render is using the GPU.
    // Keep the same spatial tolerance; allow convergence within the input hold.
    const resetDeadline = Date.now() + 5000
    let reset
    do { await pause(300); reset = await snapshot() }
    while (moved(initial, reset) && Date.now() < resetDeadline)
    report.checks.reset = !moved(initial, reset)
    await page.setViewportSize({ width: 500, height: 800 }); await pause(650)
    const portrait = await snapshot()
    const mobilePath = path.join(directory, '500x800.png')
    await page.screenshot({ path: mobilePath })
    report.views.push({ width: 500, height: 800, screenshot: mobilePath, ...portrait })
    report.checks.portraitFits = fits(portrait)
    report.checks.resize = portrait.pixels[0] === Math.floor(500 * portrait.pixelRatio) && portrait.pixels[1] === Math.floor(800 * portrait.pixelRatio)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 400, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 250, y: 430, id: 1 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(650)
    const touch = await snapshot()
    report.checks.touchRotate = moved(portrait, touch)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 400, id: 1 }, { x: 330, y: 400, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 120, y: 400, id: 1 }, { x: 380, y: 400, id: 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pause(1600)
    const pinch = await snapshot()
    report.checks.pinch = moved(touch, pinch)
    await pause(1200)
    report.checks.autoPause = !moved(pinch, await snapshot())
    if (showcase) { await pause(7000); report.checks.autoResume = moved(pinch, await snapshot()) }
  } catch (error) {
    report.errors.push(error.message)
  } finally {
    signal?.removeEventListener('abort', abort)
    await browser.close().catch(() => {})
  }
  signal?.throwIfAborted()
  report.checks.offline = !report.external.length
  report.checks.noErrors = !report.errors.length
  report.ok = Object.values(report.checks).every(Boolean) && report.views.length === 2
  await fs.writeFile(path.join(directory, 'qa-report.json'), JSON.stringify(report, null, 2))
  return { ...packaged, report }
}
