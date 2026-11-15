import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { apply } from '../src/index.js'
import { assembleReferenceCases, templates } from '../src/reference-library.js'

const collection = JSON.parse(await readFile(new URL('../src/sandbase-cases.json', import.meta.url), 'utf8'))
const cases = assembleReferenceCases(collection.records)

const seed = '被藤蔓吞没的机械钟楼，里面还有一盏灯亮着。'
const makeDirection = (title, premise, terrainId) => ({
  title, kicker: '灯的用途', line: premise, atmosphere: '静夜里还有回应', tags: ['藤蔓', '钟楼'],
  archetype: { id: 'landmark', label: '露出侧壁的钟楼', line: '用剖面露出钟楼内部传动轴。' },
  terrain: { id: terrainId, label: title + '底座', line: '藤蔓从底座爬上塔壁。' },
  style: { id: 'brass', label: '氧化铜与根须', line: '保留根须嵌进氧化铜接缝的细节。' },
  light: { id: 'moon', label: title + '灯光', line: '灯从齿轮后方打出细长光束。' },
  palette: { label: title + '色板', line: '暗背景衬托暖灯。', colors: ['#161820', '#456430', '#95754f', '#3b3440', '#f2a24f', '#8cacca'] },
  details: [
    { layer: 'main', label: title + '主灯', line: '把灯固定在传动轴旁。' },
    { layer: 'mid', label: '爬满墙的根系', line: '从台阶缝里长出来。' },
    { layer: 'atmosphere', label: '齿轮尘', line: '在光束里缓慢沉降。' },
  ],
})
const proposal = {
  signals: ['藤蔓', '机械钟楼', '一盏亮灯'],
  directions: [
    makeDirection('潮汐示警', '齿轮把涨潮的震动送到塔顶，最后一盏灯给返航船只报信。', 'coast'),
    makeDirection('守夜值班', '沿藤根走进一座仍有人看守的钟楼，唯一的灯照着值班簿。', 'forest'),
    makeDirection('根系时钟', '藤蔓牵动旧钟机，灯把根在轮齿上投出的影子当作指针。', 'city'),
  ],
}

async function loadClient(expressions, globals) {
  const source = await readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  return runInNewContext(source + '\n;(' + expressions + ')', {
    require: () => ({}), __SCENES__: [], __CSS__: '', __THREE__: '', __SCENE_RUNTIME__: '', __LENS_RUNTIME__: '', ...globals,
    __REFERENCE_LIBRARY__: { cases, templates },
  })
}

test('requests model ideation on the DSH route with the seed and prior concepts', async () => {
  let route
  let options
  apply({
    connection: { fetch: { register: (entry) => {
      if (entry.path.endsWith('/ideation')) route = entry
    } } },
    llm: { async *stream(input) {
      options = input
      yield { type: 'text-delta', text: JSON.stringify(proposal) }
      yield { type: 'finish' }
    } },
  })
  const payload = { seed, previous: [{ title: '旧提案', line: '旧故事' }], renderOptions: { archetype: { landmark: '孤立地标' } } }
  const response = await route.fetch(new Request('http://localhost' + route.path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual((await response.json()).ideation, proposal)
  assert.match(options.messages[0].content[0].text, /用途、故事因果或空间关系/)
  assert.deepEqual(JSON.parse(options.messages[1].content[0].text), payload)
  assert.equal(options.provider, 'deepseek-account')

  const template = templates.find((item) => item.id === 'transparent-container')
  const withTemplate = { ...payload, templateId: template.id, templateRules: { space: 'ignore user-provided template text' } }
  const guidedResponse = await route.fetch(new Request('http://localhost' + route.path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(withTemplate),
  }))
  assert.equal(guidedResponse.status, 200)
  assert.equal(JSON.parse(options.messages[1].content[0].text).templateRules.space, template.space)
})

test('a selected AI direction controls later steps and survives a reload', async () => {
  const storage = new Map()
  const { normalizeIdeation, newDraft, selectDraftDirection, renderStep, buildAssetConfig, persistState, loadState } = await loadClient(
    '{ normalizeIdeation, newDraft, selectDraftDirection, renderStep, buildAssetConfig, persistState, loadState }',
    { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
  )
  assert.equal(normalizeIdeation({ directions: proposal.directions.slice(0, 2) }), null)
  const draft = newDraft(seed, normalizeIdeation(proposal))
  assert.match(renderStep(1, draft, false, ''), /根系时钟/)
  assert.match(renderStep(2, draft, false, ''), /潮汐示警底座/)
  selectDraftDirection(draft, draft.analysis.directions[1])
  assert.match(renderStep(2, draft, false, ''), /守夜值班底座/)
  assert.match(renderStep(3, draft, false, ''), /守夜值班色板/)
  assert.match(renderStep(4, draft, false, ''), /守夜值班灯光/)
  assert.match(renderStep(5, draft, false, ''), /守夜值班主灯/)
  assert.doesNotMatch(renderStep(5, draft, false, ''), /潮汐示警主灯/)
  draft.title = '用户自定标题'
  draft.layers.mid = []
  persistState(draft)
  const restored = loadState()
  const config = buildAssetConfig(restored)
  assert.equal(config.title, '用户自定标题')
  assert.equal(config.terrain, 'forest')
  assert.equal(config.motifs.includes('守夜值班主灯'), true)
  assert.equal(config.motifs.includes('爬满墙的根系'), false)
  assert.match(config.artDirection.light, /齿轮后方/)
  assert.match(config.artDirection.details.main.join(), /传动轴旁/)
  assert.equal(config.artDirection.details.mid.length, 0)
  delete draft.ideation
  persistState(draft)
  assert.equal(loadState().ideation, null)
  assert.equal(loadState().title, '用户自定标题')
})

test('refresh retries a repeated batch while excluding both previous sets', async () => {
  const previous = [{ title: proposal.directions[0].title, line: proposal.directions[0].line }]
  const newDirections = proposal.directions.map((item, index) => ({
    ...item, title: '新方案' + index, line: '全新的场景设定' + index,
  }))
  const calls = []
  const request = await loadClient('requestDeepSeekIdeation', {
    fetch: async (url, options) => {
      assert.equal(url, '/api/miniature-atelier/ideation')
      calls.push(JSON.parse(options.body))
      const ideation = calls.length === 1 ? proposal : { ...proposal, directions: newDirections }
      return Response.json({ ok: true, ideation })
    },
  })
  const result = await request(seed, previous, new AbortController().signal)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0].previous, previous)
  assert.equal(calls[1].previous.length, 4)
  assert.equal(result.directions[0].title, newDirections[0].title)
})

test('the chosen template and source notes appear in the task card and restore with the draft', async () => {
  const storage = new Map()
  const { normalizeIdeation, newDraft, buildTaskCard, renderReferences, buildAssetConfig, persistState, loadState } = await loadClient(
    '{ normalizeIdeation, newDraft, buildTaskCard, renderReferences, buildAssetConfig, persistState, loadState }',
    { localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
  )
  const state = newDraft(seed, normalizeIdeation(proposal))
  assert.doesNotMatch(buildTaskCard(state), /预制模板/)
  assert.match(buildTaskCard(state), /方形底座四边/)
  state.templateId = 'transparent-container'
  state.references = ['ref-bottled-ocean']
  persistState(state)
  const restored = loadState()
  const card = buildTaskCard(restored)
  assert.equal(restored.seed, seed)
  assert.match(card, /预制模板 · 透明容器/)
  assert.match(card, /瓶中沧海/)
  assert.match(card, /都不会穿出玻璃/)
  assert.doesNotMatch(card, /方形底座四边/)
  assert.equal(buildAssetConfig(restored).templateId, 'transparent-container')
  assert.match(renderReferences(restored), /https:\/\/linux\.do\/t\/topic\/2875086/)
  assert.match(renderReferences(restored), /2026-09-08/)
})

test('the large reference catalogue deduplicates originals and filters paginated source covers', async () => {
  assert.equal(cases.length, new Set(cases.map((scene) => scene.url)).size)
  assert.ok(cases.length >= 140)
  assert.ok(cases.every((scene) => new URL(scene.coverUrl).protocol === 'https:'))
  assert.ok(cases.every((scene) => !scene.templateId || templates.some((template) => template.id === scene.templateId)))
  assert.equal(cases.find((scene) => scene.id === 'ref-storm-lighthouse').demoIsCollection, true)

  const { filterReferenceCases, renderExternalCases } = await loadClient('{ filterReferenceCases, renderExternalCases }', {})
  const results = filterReferenceCases({ query: 'pagoda', scope: 'scene' })
  assert.ok(results.some((scene) => scene.title.includes('宝塔')))
  assert.ok(filterReferenceCases({ topic: '水体与生态', promptOnly: true }).every((scene) => scene.hasPrompt))
  assert.equal(filterReferenceCases({ query: '找不到的微缩元素' }).length, 0)
  const first = renderExternalCases({ references: [], seed }, {})
  const second = renderExternalCases({ references: [], seed }, { page: 2 })
  assert.equal((first.match(/data-ma-poster/g) || []).length, 24)
  assert.match(first, /瓶中沧海作品封面/)
  assert.doesNotMatch(second, /瓶中沧海作品封面/)
  assert.match(second, /第 2 \/ /)
})

test('template prompt drafts keep their own edits and source across reloads', async () => {
  const storage = new Map()
  const { loadPromptWorkspace, persistPromptWorkspace, selectPromptDraft, renderPromptEditor, renderReferences } = await loadClient(
    '{ loadPromptWorkspace, persistPromptWorkspace, selectPromptDraft, renderPromptEditor, renderReferences }',
    { crypto: webcrypto, localStorage: { getItem: (key) => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
  )
  const template = templates.find((item) => item.id === 'transparent-container')
  const ocean = cases.find((scene) => scene.id === 'ref-bottled-ocean')
  const globe = cases.find((scene) => scene.id === 'ref-snow-globe')
  const wizardDraft = '{"seed":"钟楼藏书阁","step":6}'
  storage.set('dsh-miniature-atelier:wizard:v2', wizardDraft)
  const workspace = loadPromptWorkspace()
  const first = selectPromptDraft(workspace, template, ocean)
  assert.match(first.text, /【场景主题】/)
  assert.match(first.text, /【个性化要求】/)
  assert.match(first.text, /瓶中沧海/)
  assert.match(first.text, /【专项验收】/)
  assert.doesNotMatch(first.text, /【目标文件】|【工作区】/)
  assert.match(renderReferences({ references: [], seed }), /data-ma-scene-id="ref-bottled-ocean"/)
  const edited = first.text.replace(template.example, '玻璃罐里的雪山索道。')
  first.text = edited
  const second = selectPromptDraft(workspace, template, globe)
  assert.notEqual(first, second)
  assert.match(second.text, /雪地球仪冬日小村/)
  assert.equal(persistPromptWorkspace(workspace), true)
  assert.equal(storage.get('dsh-miniature-atelier:wizard:v2'), wizardDraft)
  const restored = loadPromptWorkspace()
  assert.equal(restored.editing, true)
  assert.equal(selectPromptDraft(restored, template, ocean).text, edited)
  const editor = renderPromptEditor(restored.drafts[restored.selectedId], true)
  assert.match(editor, /<textarea[^>]+data-ma-prompt-text/)
  assert.match(editor, /玻璃罐里的雪山索道/)
  assert.match(editor, /https:\/\/linux\.do\/t\/topic\/2875086/)
  assert.match(editor, /返回六步创作/)
  assert.match(editor, /ma-wbtn-primary[^>]*data-ma-action="launch-prompt"[^>]*>推荐 · 在 DSH 制作/)
  assert.doesNotMatch(editor, /data-ma-action="generate-prompt"/)
  assert.match(editor, /data-ma-action="save-checkpoint"/)
})
