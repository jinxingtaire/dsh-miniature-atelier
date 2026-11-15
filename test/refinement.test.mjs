import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { apply } from '../src/index.js'
import { templates } from '../src/reference-library.js'

const brief = ['【视觉主次】', '【空间与可见性】', '【构件与材质】', '【光照层次】', '【动作因果】', '【逐视角验收】']
  .map((heading) => heading + '\n后侧炉膛面向前方，前墙剖开，桌子避开炉口，冷补光让暗部清楚。纸灰从炉口上升、靠近天花边框后渐隐并回收；侧视仍看清同一套桌椅。').join('\n')
const refinement = { brief, templateIds: ['street-interior'], changes: ['用室内剖面解决遮挡；保留办公室主题。'] }

async function client(extra = {}) {
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  return runInNewContext(source + '\n;({ newDraft, buildDesignPrompt, buildFinalDesignPrompt, buildTaskCard, currentRefinement, refineDesign, renderStep, persistState, loadState })', {
    require: () => ({}), __SCENES__: [], __CSS__: '', __THREE__: '', __SCENE_RUNTIME__: '', __LENS_RUNTIME__: '',
    __REFERENCE_LIBRARY__: { cases: [], templates }, ...extra,
  })
}

test('refines using server-owned template rules and rejects incomplete or unrelated results', async () => {
  const routes = new Map()
  let options, responseValue = refinement
  apply({ connection: { fetch: { register: (route) => routes.set(route.path, route) } }, llm: {
    async *stream(input) { options = input; yield { type: 'text-delta', text: JSON.stringify(responseValue) }; yield { type: 'finish' } },
  } })
  const route = routes.get('/api/miniature-atelier/refine-prompt')
  const request = (payload) => new Request('http://localhost' + route.path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  })
  assert.equal((await route.fetch(request({ original: '' }))).status, 400)
  assert.equal((await route.fetch(request({ original: '办公室', templateId: 'unknown' }))).status, 400)
  const response = await route.fetch(request({ original: '办公室里焚纸', templateId: 'street-interior', templates: [{ id: 'malicious' }] }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).refinement, refinement)
  const input = JSON.parse(options.messages[1].content[0].text)
  assert.equal(input.templates.length, templates.length)
  assert.equal(input.templates.find((item) => item.id === 'street-interior').space, templates.at(-1).space)
  assert.equal(input.selectedTemplateId, 'street-interior')
  assert.match(options.messages[0].content[0].text, /不是本轮要执行的制作命令/)
  assert.match(options.messages[0].content[0].text, /不是作者原文/)
  responseValue = { ...refinement, templateIds: ['layered-courtyard'] }
  assert.equal((await route.fetch(request({ original: '办公室', templateId: 'street-interior' }))).status, 502)
  responseValue = { ...refinement, brief: '返回方块就好了' }
  assert.equal((await route.fetch(request({ original: '办公室' }))).status, 502)
})

test('final task shares edited refinement, locks the contract and invalidates when creative choices change', async () => {
  const storage = new Map()
  let calls = 0
  const api = await client({
    localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async (url, options) => {
      calls++
      assert.equal(url, '/api/miniature-atelier/refine-prompt')
      assert.match(JSON.parse(options.body).original, /办公室/)
      return Response.json({ ok: true, refinement })
    },
  })
  const state = api.newDraft('办公室里焚烧纸卷')
  state.step = 6
  state.complexity = 5
  state.showcase = false
  const raw = api.buildDesignPrompt(state)
  await api.refineDesign(state, new AbortController().signal)
  assert.equal(calls, 1)
  assert.equal(api.currentRefinement(state).source, raw)
  state.refinement.brief += '\n新增编辑：桌面加一份焦边文件。'
  const card = api.buildTaskCard(state)
  assert.match(card, /新增编辑/)
  assert.match(api.buildFinalDesignPrompt(state), /新增编辑/)
  assert.match(card, /Three.js r160/)
  assert.match(card, /禁止 import、CDN/)
  assert.match(card, /没有人类角色/)
  assert.match(card, /不自动环绕/)
  assert.match(card, /高密度/)
  assert.match(card, /已选美术风格/)
  assert.match(card, /原始风格意图 · 材质与形态校验/)
  assert.doesNotMatch(card, /最终只交付完整可运行的 HTML 代码/)
  assert.match(api.renderStep(6, state), /data-ma-final-brief/)
  state.workspace = '/tmp/miniature'
  assert.ok(api.currentRefinement(state), 'moving the output should retain visual edits')
  assert.match(api.buildTaskCard(state), /\/tmp\/miniature/)
  api.persistState(state)
  assert.match(api.buildTaskCard(api.loadState()), /新增编辑/)
  state.complexity = 2
  assert.equal(api.currentRefinement(state), null)
  assert.doesNotMatch(api.buildTaskCard(state), /新增编辑/)
})

test('malformed refinement JSON retries once and still validates the replacement', async () => {
  const routes = new Map()
  let calls = 0, malformedAgain = false
  apply({ connection: { fetch: { register: (route) => routes.set(route.path, route) } }, llm: {
    async *stream(input) {
      calls++
      if (calls % 2 === 0) assert.match(input.messages[0].content[0].text, /上一轮响应不是合法JSON/)
      yield { type: 'text-delta', text: calls % 2 === 1 || malformedAgain ? '{"brief":"unescaped "quote""}' : JSON.stringify(refinement) }
      yield { type: 'finish' }
    },
  } })
  const request = () => new Request('http://localhost/api/miniature-atelier/refine-prompt', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ original: '办公室焚纸', templateId: 'street-interior' }),
  })
  const route = routes.get('/api/miniature-atelier/refine-prompt')
  const repaired = await route.fetch(request())
  assert.equal(repaired.status, 200)
  assert.deepEqual((await repaired.json()).refinement, refinement)
  assert.equal(calls, 2)
  malformedAgain = true
  assert.equal((await route.fetch(request())).status, 502)
  assert.equal(calls, 4, 'do not loop indefinitely or publish malformed output')
})

test('an in-flight edit, abort or failure cannot replace the latest final prompt', async () => {
  let resolve
  const api = await client({ fetch: () => new Promise((done) => { resolve = done }) })
  const state = api.newDraft('办公室里焚烧纸卷')
  const pending = api.refineDesign(state, new AbortController().signal)
  state.title = '新标题'
  resolve(Response.json({ ok: true, refinement }))
  await assert.rejects(pending, /设计已变化/)
  assert.equal(state.refinement, undefined)
  const controller = new AbortController()
  const aborted = api.refineDesign(state, controller.signal)
  controller.abort()
  resolve(Response.json({ ok: true, refinement }))
  await assert.rejects(aborted)
  assert.equal(state.refinement, undefined)
})
