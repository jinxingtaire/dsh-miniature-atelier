import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/index.js'

const routeUrl = 'http://localhost/api/miniature-atelier/design'

test('serves health and DeepSeek generation through the DSH connection', async () => {
  const routes = new Map()
  const design = { title: '雨夜灯塔', structure: 'tower' }
  let call
  apply({
    connection: { fetch: { register: (route) => routes.set(route.path, route) } },
    llm: {
      async *stream(options) {
        call = options
        yield { type: 'text-delta', text: JSON.stringify(design) }
        yield { type: 'finish' }
      },
    },
  })

  const route = routes.get(new URL(routeUrl).pathname)
  assert.ok(route, 'the plugin must register a same-origin DSH route')
  assert.deepEqual(route.methods, ['GET', 'POST'])
  const health = await route.fetch(new Request(routeUrl))
  assert.equal(health.status, 200)
  const status = await health.json()
  assert.equal(status.service, 'miniature-atelier-deepseek')
  assert.match(status.enginePath, /[\\/]src[\\/]three\.min\.js$/)
  assert.equal(call, undefined, 'checking health must not request a model completion')

  const request = new Request(routeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: '雨夜灯塔' }),
  })
  const response = await route.fetch(request)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    ok: true, design, provider: 'deepseek-account', model: 'deepseek-flash',
  })
  assert.equal(call.provider, 'deepseek-account')
  assert.equal(call.model, 'deepseek-flash')
  assert.equal(call.reasoningEffort, 'off')
  assert.match(call.messages[1].content[0].text, /雨夜灯塔/)
  assert.equal(call.signal, request.signal)
})

test('reports a model output limit as a failed generation', async () => {
  let route
  apply({
    connection: { fetch: { register: (registration) => {
      if (registration.path.endsWith('/design')) route = registration
    } } },
    llm: {
      async *stream() {
        yield { type: 'reasoning-delta', text: 'thinking' }
        yield { type: 'finish', reason: { kind: 'max-tokens' } }
      },
    },
  })

  const response = await route.fetch(new Request(routeUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ seed: '雨夜灯塔' }),
  }))
  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /output limit/)
})

test('generates a declarative scene from the entire edited prompt', async () => {
  const routes = new Map()
  const prompt = ' 【场景主题】\n岸边的木船\n\n【个性化要求】\n给它一盏蓝灯。\n'
  const piece = { shape: 'box', size: [1, 0.3, 1], at: [[0, 0.15, 0]], color: '#aabbcc' }
  const plan = {
    title: '蓝灯小船', summary: '岸边系着一艘小船',
    palette: ['#161b25', '#42634b', '#943b2d', '#423530', '#edac56', '#b7ced4'],
    ground: '#557777', base: 'round', weather: 'storm',
    parts: [
      { ...piece, script: 'alert(1)' },
      { ...piece, shape: 'water', size: [8, 0.15, 8] },
      { ...piece, shape: 'beam', surface: 'glow', motion: 'spin' },
      { ...piece, at: [[0, 0.15, 1], [0, 999, 0]] },
      { ...piece, shape: 'script' },
    ],
    html: '<script>alert(1)</script>',
  }
  let call
  let modelPlan = plan
  apply({
    connection: { fetch: { register: (route) => routes.set(route.path, route) } },
    llm: {
      async *stream(options) {
        call = options
        yield { type: 'text-delta', text: JSON.stringify(modelPlan) }
        yield { type: 'finish' }
      },
    },
  })
  const path = '/api/miniature-atelier/prompt-scene'
  const route = routes.get(path)
  const request = (text) => new Request('http://localhost' + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: text }),
  })
  assert.deepEqual(route.methods, ['POST'])
  assert.equal((await route.fetch(request('  '))).status, 400)
  assert.equal(call, undefined)

  const response = await route.fetch(request(prompt))
  assert.equal(response.status, 200)
  assert.equal(call.provider, 'deepseek-account')
  assert.equal(call.model, 'deepseek-flash')
  assert.equal(call.messages[1].content[0].text, prompt)
  const { promptScene } = await response.json()
  assert.equal(promptScene.title, plan.title)
  assert.equal(promptScene.base, 'round')
  assert.equal(promptScene.parts.length, 4)
  assert.deepEqual(promptScene.parts[3].at, [[0, 0.15, 1]])
  assert.equal(promptScene.weather, 'storm')
  assert.equal(promptScene.parts[1].shape, 'water')
  assert.equal(promptScene.parts[2].shape, 'beam')
  assert.equal(promptScene.parts[2].motion, 'spin')
  assert.equal('html' in promptScene, false)
  assert.equal('script' in promptScene.parts[0], false)
  modelPlan = { ...plan, parts: [piece, piece, piece, { ...piece, at: [[0, 8, 0]] }] }
  const fitted = await (await route.fetch(request(prompt))).json()
  assert.equal(fitted.promptScene.parts.length, 4, 'the upper structure must survive fitting')
  assert.ok(fitted.promptScene.parts.every((part) =>
    part.at.every((pos) => pos[1] + part.size[1] / 2 <= 6.2 + 1e-9)))
  modelPlan = { ...plan, parts: [piece] }
  assert.equal((await route.fetch(request(prompt))).status, 502)
})
