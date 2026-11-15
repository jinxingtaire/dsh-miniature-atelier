import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { templates, cases } from '../src/reference-library.js'

async function client(storage = new Map()) {
  const source = await fs.readFile(new URL('../src/client.js', import.meta.url), 'utf8')
  return runInNewContext(source + '\n;({withBundledEngine,freshState,loadState,persistState,newDraft,MODELING_WORKFLOWS,normalizeModelingDraft,modelingState,modelingErrors,parseProductionSteps,buildModelingTask,buildModelingSnapshot,renderModelingWorkflow,renderCreationModes,applyModelingParameters,modelingParameterSource,renderPromptEditor,createFreeDraft,loadPromptWorkspace,persistPromptWorkspace,buildPromptTask})', {
    require: () => ({}), __SCENES__: [], __CSS__: '', __THREE__: '', __SCENE_RUNTIME__: '', __LENS_RUNTIME__: '',
    __REFERENCE_LIBRARY__: { templates, cases },
    localStorage: { getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value) },
    fetch:()=>{throw new Error('Local requirements must not call a model or install a skill')},
  })
}

const validParameters = {
  machine: { relations: '曲轴带动连杆，凸轮轴以曲轴半速运转。', rpm: '60' },
  teardown: { relations: '先拆卸外壳，再沿轴线抽出传动组。' },
  factory: { relations: '壳体上料 | 2 | 1\n装配 | 7 | 2\n包装入库 | 3 | 1', arrival: '2', buffer: '4' },
}

test('each modeling example produces a specific native DSH task without landscape-only constraints',async()=>{
  const c=await client(), state=c.freshState()
  for(const flow of c.MODELING_WORKFLOWS) for(const example of flow.examples) {
    const draft=c.normalizeModelingDraft(flow.id,{...flow.defaults,...example,...validParameters[flow.id]})
    assert.equal(c.modelingErrors(flow.id,draft).length,0)
    const task=c.buildModelingTask(state,flow.id,draft,'fixture-'+flow.id)
    assert.ok(task.includes(example.subject));assert.ok(task.includes(draft.relations.split('\n')[0]))
    assert.match(task,/禁止覆盖已有成品/);assert.match(task,/1600×1000 与 500×800/)
    assert.match(task,/无需安装、调用或假定存在/)
    assert.doesNotMatch(task,/场景无标题、说明、按钮、HUD|全部构件位于一个完整正方形底座内/)
    assert.match(task,/【目标文件】\.\/miniature-runs\/fixture-/)
    assert.ok(task.split('\n')[0].includes(example.title),'native conversation opening must identify the task instead of repeating a generic sentence')
    assert.match(task,/按面板实际尺寸预留可见区域/)
  }
})

test('mechanical, teardown and factory contracts describe actual state verification, not fake gauges',async()=>{
  const c=await client(), state=c.freshState()
  function task(id){const flow=c.MODELING_WORKFLOWS.find(f=>f.id===id);return c.buildModelingTask(state,id,{...flow.defaults,...flow.examples[0],...validParameters[id]},id)}
  assert.match(task('machine'),/720°/);assert.match(task('machine'),/同一时间与几何模型/)
  assert.match(task('machine'),/未计算的温度、压力、效率与功率不要显示为真实结果/)
  assert.match(task('machine'),/须标注开闭角和对应说明/)
  assert.match(task('teardown'),/拆开时暂停机构运转/);assert.match(task('teardown'),/至少两次/)
  assert.match(task('teardown'),/逐级检查拆装路径/)
  assert.match(task('factory'),/累计投入 = 已完成 \+ 在制品/);assert.match(task('factory'),/队列满时上游阻塞/)
  assert.match(task('factory'),/演示假设，不是实测产能/)
})

test('factory validation rejects malformed or unsafe numeric values before a task can be sent',async()=>{
  const c=await client(), base=c.normalizeModelingDraft('factory',{subject:'包裹分拣中心',...validParameters.factory})
  for(const relations of ['', '唯一工位 | 1 | 1','工位 | 0 | 1\n出库 | 1 | 1','工位 | Infinity | 1\n出库 | 1 | 1','工位 | 1 | 1.5\n出库 | 1 | 1','工位 | | 1\n出库 | 1 | 1', 'x | 1 | 1 | unexpected\ny | 1 | 1']) {
    assert.ok(c.parseProductionSteps(relations).error)
    assert.throws(()=>c.buildModelingTask(c.freshState(),'factory',{...base,relations},'bad'))
  }
  for(const invalid of [{arrival:''},{arrival:'NaN'},{buffer:'0'},{buffer:'1.1'}]) assert.throws(()=>c.buildModelingTask(c.freshState(),'factory',{...base,...invalid},'bad'))
  const valid=c.parseProductionSteps('进料｜0.5｜2\n装配 | 7 | 3')
  assert.equal(valid.steps.length,2);assert.equal(valid.steps[1].machines,3)
  const machine=c.normalizeModelingDraft('machine',{subject:'蒸汽机',rpm:'Infinity'})
  assert.ok(c.modelingErrors('machine',machine).length)
})

test('all workflow drafts survive reload with and without an existing six-step scene',async()=>{
  for(const hasScene of [false,true]) {
    const storage=new Map(),c=await client(storage),state=hasScene?c.newDraft('雨夜街角小店'):c.freshState()
    state.creationMode='teardown';state.workspace='./custom-models'
    state.modelingDrafts.machine.subject='我的水平蒸汽机'
    state.modelingDrafts.teardown.subject='我的机器人关节';state.modelingDrafts.teardown.initialView='exploded'
    state.modelingDrafts.factory.relations='上料 | 7 | 2\n包装 | 11 | 1'
    state.modelingDrafts.machine.controls=[]
    c.persistState(state);const restored=c.loadState()
    assert.equal(restored.creationMode,'teardown');assert.equal(restored.workspace,'./custom-models')
    assert.equal(restored.modelingDrafts.machine.subject,'我的水平蒸汽机')
    assert.equal(restored.modelingDrafts.teardown.initialView,'exploded')
    assert.equal(restored.modelingDrafts.factory.relations,'上料 | 7 | 2\n包装 | 11 | 1')
    assert.equal(restored.modelingDrafts.machine.controls.length,0)
    if(hasScene) assert.equal(restored.seed,'雨夜街角小店')
  }
})

test('custom style, no style and deselected controls reach the complete editable snapshot',async()=>{
  const c=await client(),state=c.freshState(),workspace=c.loadPromptWorkspace()
  const draft=c.normalizeModelingDraft('machine',{subject:'透明亚克力气泵',rpm:'30',style:'unconstrained',customStyle:'主体透明蓝 #123456，白色背景',controls:[],mustKeep:'保留双缸',avoid:'避免黄铜'})
  const text=c.buildModelingTask(state,'machine',draft,'snapshot')
  assert.match(text,/不预设画风、材质或配色/);assert.match(text,/#123456/)
  assert.match(text,/本次选择的控制项：无额外控制面板/);assert.match(text,/保留双缸/);assert.match(text,/避免黄铜/)
  const snapshot=c.createFreeDraft(workspace,text,'我的气泵');snapshot.workflowId='machine'
  snapshot.text+='\n我的全文编辑：缩小飞轮。';c.persistPromptWorkspace(workspace)
  const loaded=c.loadPromptWorkspace().drafts[workspace.selectedId]
  assert.equal(c.buildPromptTask(loaded),snapshot.text)
  const html=c.renderPromptEditor(loaded,true)
  assert.match(html,/返回机械运转需求/);assert.doesNotMatch(html,/data-ma-action="new-example-draft"/)
  assert.equal(loaded.workflowId,'machine')
})

test('forms escape user text, offer a short direct flow, and preserve invalid example backups',async()=>{
  const c=await client(),state=c.freshState();state.creationMode='machine'
  state.modelingDrafts.machine.subject='<img src=x onerror=alert(1)>'
  const html=c.renderModelingWorkflow(state)
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/)
  assert.match(html,/data-ma-action="launch-modeling"/);assert.match(html,/data-ma-action="edit-modeling"/)
  assert.match(html,/不限定画风/);assert.doesNotMatch(html,/下一步|给它一副骨架/)
  assert.equal((c.renderCreationModes(state).match(/<option\b/g)||[]).length,4)
  assert.match(c.renderCreationModes(state),/制作类型/)
  const incomplete=c.normalizeModelingDraft('factory',{subject:'用户自定义分拣线',relations:'未填好',customStyle:'粉色厂房'})
  const backup=c.buildModelingSnapshot(state,'factory',incomplete)
  assert.match(backup,/尚未通过参数检查/);assert.match(backup,/粉色厂房/);assert.match(backup,/未填好/)
  const malformed=c.modelingState({creationMode:'unknown',modelingDrafts:{machine:null}})
  assert.equal(malformed.creationMode,'scene');assert.equal(malformed.modelingDrafts.machine.rpm,'')
})

test('fresh forms have no preset stations; generated and manually edited fields can coexist', async()=>{
  const c = await client(), state = c.freshState();
  state.creationMode = 'factory';
  const blank = state.modelingDrafts.factory;
  assert.equal(blank.relations, '');
  assert.equal(blank.arrival, '');
  assert.equal(blank.buffer, '');
  const draft = c.normalizeModelingDraft('factory',{subject:'果汁灌装线', arrival:'7', editedFields:['arrival']});
  const source = c.modelingParameterSource(state, draft);
  const result = c.applyModelingParameters('factory', draft, {
    title:'果汁灌装线', relations:'洗瓶 | 2 | 1\n灌装 | 8 | 2', arrival:'9', buffer:'3', assumptions:'缓冲是演示估算',
  },source);
  assert.equal(result.parameterSource,source);
  assert.equal(result.arrival,'7');
  assert.equal(result.buffer,'3');
  const task = c.buildModelingTask(state, 'factory', result, 'juice');
  assert.match(task,/灌装：单件 8 秒，并行设备 2 台/);
  assert.match(task,/到料间隔 7 秒/);
  assert.match(task,/缓冲是演示估算/);
});

test('a fresh installation points native creation to its bundled engine without overriding revisions', async () => {
  const { withBundledEngine } = await client()
  const task = '【任务】齿轮\n【工作方式】\n制作模型'
  for (const path of ['/tmp/插件 包/lib/three.min.js', 'C:\\Users\\DSH\\three.min.js']) {
    const result = withBundledEngine(task, path)
    assert.ok(result.includes('【本机 Three.js r160】' + JSON.stringify(path)))
    assert.equal(withBundledEngine(result, path), result)
  }
  assert.equal(withBundledEngine(task, './three.min.js'), task)
  assert.equal(withBundledEngine('【任务】修改现有作品', '/tmp/three.min.js'), '【任务】修改现有作品')
})
