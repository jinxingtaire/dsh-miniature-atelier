import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { templates, cases } from '../src/reference-library.js'
import { apply } from '../src/index.js'

async function client(storage = new Map()) {
  const source = await fs.readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  return runInNewContext(source + '\n;({newDraft,chosen,renderStep,renderLanding,renderPromptEditor,renderImageReferences,referenceCard,buildTaskCard,buildDesignPrompt,createFreeDraft,createExampleDraft,STARTER_SCENES,checkpointPromptDraft,restorePromptCheckpoint,buildPromptTask,buildRevisionPrompt,loadPromptWorkspace,persistPromptWorkspace,persistState,loadState,migrateWorkspace,renderNativeDispatchStatus,DEFERRED_ACTIONS})', {
    require: () => ({}), __SCENES__: [], __CSS__: '', __THREE__: '', __SCENE_RUNTIME__: '', __LENS_RUNTIME__: '',
    __REFERENCE_LIBRARY__: { templates, cases },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: () => { throw new Error('Local editing must not require a model or network') },
  })
}

test('stable creation surfaces omit deferred paths and retain guided customization and local editing', async () => {
  const c = await client(), state = c.newDraft('雨夜小屋')
  const workspace = c.loadPromptWorkspace()
  const draft = c.createFreeDraft(workspace, '我的完整编辑稿')
  const surfaces = c.renderStep(6, state) + c.renderPromptEditor(draft, true)
    + c.renderLanding(state, false, '', false) + c.referenceCard(cases[0], state, false, true)
  for (const action of c.DEFERRED_ACTIONS) assert.doesNotMatch(surfaces, new RegExp('data-ma-action="' + action + '"'))
  assert.match(surfaces, /data-ma-action="new-free-draft"/)
  assert.match(surfaces, /data-ma-action="edit-final-prompt"/)
  assert.match(surfaces, /AI 优化为可选操作/)
  assert.match(c.renderStep(3, state), /data-ma-color-index="5"/)
  assert.match(c.renderStep(6, state), /data-ma-input="showcase"/)
})

test('native send notice distinguishes dispatch from reference preparation and completion', async () => {
  const c=await client()
  assert.equal(c.renderNativeDispatchStatus({}), '')
  const sent=c.renderNativeDispatchStatus({modelLaunch:{phase:'sent',title:'风车牧守',target:'./miniature-runs/scene.html',startedAt:1}})
  assert.match(sent,/制作指令已发送/);assert.match(sent,/风车牧守/)
  assert.match(sent,/独立准备会话/);assert.match(sent,/不代表成品已完成/)
  assert.doesNotMatch(sent,/data-ma-action="launch-generation"/)
  assert.match(sent, /<details><summary>.*<\/summary>[\s\S]*<\/details>\s*<button[^>]+data-ma-action="dismiss-dispatch"[^>]*>关闭提示<\/button>/)
  const state = c.newDraft('雨夜小屋')
  state.modelLaunch = null
  c.persistState(state)
  assert.equal(c.renderNativeDispatchStatus(c.loadState()), '')
  assert.match(c.renderNativeDispatchStatus({modelLaunch:{phase:'error',error:'发送失败'}}),/发送未完成/)
})

test('starter examples provide executable detailed briefs with real output settings and stable exports', async () => {
  const c=await client(), workspace=c.loadPromptWorkspace()
  for(const example of c.STARTER_SCENES) {
    const draft=c.createExampleDraft(workspace,example.id,'./my-scenes')
    assert.ok(draft.text.length>1800)
    assert.match(draft.text,/【目标文件】\.\/my-scenes\/.+\.html/)
    assert.match(draft.text,/【输出目录】\.\/my-scenes/)
    assert.match(draft.text,/输出目录不会改变会话工作区/)
    for(const section of ['场景主题','主体结构','构图与空间','风格与材质','光照','动态与交互','必须保留与避免','技术交付','通用验收']) assert.ok(draft.text.includes('【'+section+'】'))
    assert.doesNotMatch(draft.text,/写下你要制作的主体与环境|明确需要的动作/)
    assert.equal(c.buildPromptTask(draft),draft.text)
    assert.match(c.renderPromptEditor(draft,false),/data-ma-action="new-example-draft"/)
  }
})

test('choosing another example creates a separate draft and preserves personalized text across reload',async()=>{
  const storage=new Map(),c=await client(storage),workspace=c.loadPromptWorkspace()
  const first=c.createExampleDraft(workspace,'windmill'); first.text+='\n用户修改：只保留两只羊。'
  const second=c.createExampleDraft(workspace,'workshop')
  assert.notEqual(first,second)
  assert.equal(Object.keys(workspace.drafts).length,2)
  c.persistPromptWorkspace(workspace)
  const loaded=c.loadPromptWorkspace()
  assert.equal(loaded.drafts[loaded.selectedId].title,'暖光木作工坊')
  assert.ok(Object.values(loaded.drafts).some(draft=>draft.text.includes('只保留两只羊')))
  assert.equal(c.createExampleDraft(workspace,'missing'),null)
})

test('free text and checkpoints survive reload, and restoring saves the current edits for recovery', async () => {
  const storage = new Map(), c = await client(storage)
  const workspace = c.loadPromptWorkspace(), draft = c.createFreeDraft(workspace, '第一版：浅色木屋', '我的木屋')
  c.checkpointPromptDraft(draft)
  draft.text = '第二版：加入蓝色窗框'
  c.persistPromptWorkspace(workspace)
  const restored = c.loadPromptWorkspace(), current = restored.drafts[restored.selectedId]
  assert.equal(current.text, '第二版：加入蓝色窗框')
  assert.equal(c.restorePromptCheckpoint(current, 0), true)
  assert.equal(current.text, '第一版：浅色木屋')
  assert.equal(current.checkpoints.at(-1).text, '第二版：加入蓝色窗框')
  assert.equal(c.restorePromptCheckpoint(current, -1), false)
  current.text = '【目标文件】./custom/output.html\n全文自定义，不自动改写。'
  assert.equal(c.buildPromptTask(current), current.text, 'native send, copy and export must use the edited text unchanged')
  assert.match(c.renderPromptEditor(current, false), /data-ma-prompt-text/)
  assert.equal(Object.keys(c.loadPromptWorkspace().drafts).length, 1, 'restoring must not corrupt storage')
})

test('custom palette reaches the task and survives reload, while a free snapshot retains earlier choices', async () => {
  const storage = new Map(), c = await client(storage), state = c.newDraft('山顶天文台')
  state.customColors = ['#123456','#234567','#345678','#456789','#56789a','#6789ab']
  const task = c.buildTaskCard(state)
  for (const color of state.customColors) assert.ok(task.includes(color))
  assert.equal(c.chosen(state).palette.label, '我的配色')
  const workspace = c.loadPromptWorkspace(), snapshot = c.createFreeDraft(workspace, task)
  state.customColors[0] = '#ffffff'
  assert.ok(!snapshot.text.includes('#ffffff'))
  c.persistState(state)
  assert.equal(c.loadState().customColors[0], '#ffffff')
  assert.equal(c.migrateWorkspace('/Users/someone/Downloads/mv/miniature-runs'), './miniature-runs')
  assert.equal(c.migrateWorkspace('/my/explicit/workspace'), '/my/explicit/workspace')
})

test('revision briefs preserve the original and create unique output paths with editable constraints', async () => {
  const c = await client(), asset = { id: 'old', title: '旧作品', sourcePath: '/work/original.html' }
  const first = c.buildRevisionPrompt(asset, asset.sourcePath, '提亮暗部', '保留构图', '/work')
  const second = c.buildRevisionPrompt(asset, asset.sourcePath, '减少杂物', '保留主体', '/work')
  const output = prompt => prompt.match(/【目标文件】([^\n]+)/)[1]
  assert.notEqual(output(first), asset.sourcePath)
  assert.notEqual(output(first), output(second))
  assert.match(first, /提亮暗部/); assert.match(first, /保留构图/)
  assert.match(first, /禁止覆盖或删除原文件/)
  assert.throws(() => c.buildRevisionPrompt(asset, '', '提亮', ''))
  assert.throws(() => c.buildRevisionPrompt(asset, asset.sourcePath, '', ''))
  assert.equal(asset.sourcePath, '/work/original.html')
})

test('stable server refuses new background jobs without invoking the model, while legacy lookup remains available', async () => {
  const routes = new Map()
  apply({ connection: { fetch: { register: route => routes.set(route.path, route) } },
    sessionController: { agents: { createSession: () => { throw new Error('must not start production') } } },
    llm: { stream: () => { throw new Error('must not call model') } },
  })
  const route = routes.get('/api/miniature-atelier/full-scene')
  const health = await route.fetch(new Request('http://localhost' + route.path))
  assert.equal((await health.json()).available, false)
  const response = await route.fetch(new Request('http://localhost' + route.path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: '完整设计'.repeat(40), workspace: '/tmp/work' }),
  }))
  assert.equal(response.status, 409)
  assert.match((await response.json()).error, /暂停新建后台制作/)
  const missing = await route.fetch(new Request('http://localhost' + route.path + '?id=not-a-job'))
  assert.equal(missing.status, 404)
})
