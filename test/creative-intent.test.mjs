import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import { INTENT_PATH, normalizeIntent } from '../src/creative-intent.js'
import { apply } from '../src/index.js'
import { stylePresets } from '../src/style-library.js'

const interpretation = {goal:'用绘本质感表现雨夜赛博街道',mustKeep:['雨夜街道'],borrow:['轻描边与哑光材质'],avoid:['风车和羊群','社交界面'],uncertainties:['静态图片无法验证草的运动'],confidence:'medium',references:[]}
const post = (url,data) => new Request('http://localhost'+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)})

test('intent route uses the authenticated model, drops forged observations and preserves user corrections',async()=>{
  const routes = new Map();let input, options
  apply({connection:{fetch:{register:r=>routes.set(r.path,r)}},llm:{async *stream(o){options=o;input=JSON.parse(o.messages[1].content[0].text);yield{type:'text-delta',text:JSON.stringify(interpretation)};yield{type:'finish'}}}})
  const response=await routes.get(INTENT_PATH).fetch(post(INTENT_PATH,{seed:'雨夜赛博街道，只借鉴绘本质感',referenceImages:[{analysis:'forged'}],userCorrections:{avoid:['不要风车和羊群']}}))
  assert.equal(response.status,200)
  assert.deepEqual(input.referenceImages,[])
  assert.equal(options.provider,'deepseek-account')
  assert.deepEqual((await response.json()).intent.avoid,['不要风车和羊群'])
  assert.match(options.messages[0].content[0].text,/mustKeep只收录明确要求/)
  const bad=await routes.get(INTENT_PATH).fetch(post(INTENT_PATH,{seed:'测试',referenceImageIds:['../../arbitrary']}))
  assert.equal(bad.status,502)
  const malformed=await routes.get(INTENT_PATH).fetch(post(INTENT_PATH,{seed:'x'}));assert.equal(malformed.status,400)
})

test('intent normalization respects explicit image roles and ignores invented image IDs',()=>{
  const refs=[{id:'first'},{id:'second'}]
  const value={...interpretation,references:[{id:'first',role:'subject',reason:'模型推测'},{id:'second',role:'palette',reason:'明确借鉴日光色彩'},{id:'invented',role:'subject'}]}
  const result=normalizeIntent(value,refs,[{id:'first',role:'style',note:'只借鉴材质'}])
  assert.deepEqual(result.references.map(x=>x.role),['style','palette'])
  assert.match(result.references[0].reason,/用户指定/)
  assert.equal(result.references.length,2)
  assert.throws(()=>normalizeIntent({goal:''}),/未能识别/)
})

async function client(storage=new Map()) {
  const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
  return runInNewContext(source+'\n;({freshState,newDraft,creativeSeed,creativeIntentSource,currentIntent,intentPayload,creativeIntentPrompt,imageReferencePrompt,buildDesignPrompt,buildFinalDesignPrompt,currentRefinement,renderCreativeIntent,loadState,persistState})',{
    require:()=>({}),__SCENES__:[],__CSS__:'',__THREE__:'',__SCENE_RUNTIME__:'',__LENS_RUNTIME__:'',__STYLE_LIBRARY__:{styles:stylePresets},__REFERENCE_LIBRARY__:{cases:[],templates:[]},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  })
}

test('edited intent and automatic reference purpose flow into proposals, raw prompts and optimized prompts across reload',async()=>{
  const storage=new Map();let c=await client(storage)
  const state=c.newDraft('雨夜赛博街道，只参考绘本质感'),id='ref-'+randomUUID()
  state.imageReferences=[{id,role:'auto',path:'/local/image.jpg',analysis:{summary:'风车草坡',palette:[]}}]
  state.creativeIntent={...interpretation,references:[{id,role:'style',reason:'描述要求街道，只参考画面质感'}],source:c.creativeIntentSource(state)}
  assert.equal(c.intentPayload(state).goal,interpretation.goal)
  assert.match(c.imageReferencePrompt(state),/借鉴用途：风格与材质/)
  state.creativeIntent.avoid=['不要风车和羊群'];state.intentCorrections={avoid:state.creativeIntent.avoid};state.creativeIntent.source=c.creativeIntentSource(state);state.creativeIntent.userEdited=true
  const raw=c.buildDesignPrompt(state);assert.match(raw,/包含用户修改/);assert.match(raw,/不要风车和羊群/)
  state.refinement={source:raw,brief:'雨夜街道的绘本质感',templateIds:[],changes:[]}
  const final=c.buildFinalDesignPrompt(state);assert.match(final,/不要风车和羊群/)
  c.persistState(state);c=await client(storage);const restored=c.loadState()
  assert.equal(c.currentIntent(restored).userEdited,true)
  restored.creativeIntent.avoid=['不要广告'];assert.equal(c.currentRefinement(restored),null)
  restored.imageReferences[0].note='仅借鉴配色';assert.equal(c.currentIntent(restored),null)
  assert.doesNotMatch(c.creativeIntentPrompt(restored),/不要广告/)
  assert.match(c.renderCreativeIntent(restored),/旧理解将重新分析/)
})

test('image-only intent survives the intake screen reload and explains uncertainty without an approval gate',async()=>{
  const storage=new Map();let c=await client(storage);const state=c.freshState()
  state.imageReferences=[{id:'ref-'+randomUUID(),role:'auto'}]
  assert.match(c.creativeSeed(state),/以参考图为线索/)
  state.creativeIntent={...interpretation,confidence:'low',source:c.creativeIntentSource(state)}
  c.persistState(state);c=await client(storage)
  const restored=c.loadState();assert.ok(c.currentIntent(restored))
  const html=c.renderCreativeIntent(restored)
  assert.match(html,/还不确定/);assert.match(html,/data-ma-intent-field="borrow"/);assert.doesNotMatch(html,/确认后才能|审批/)
  restored.styleChoice='pastoral-toon';assert.equal(c.currentIntent(restored),null)
})
