import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {templates,cases} from '../src/reference-library.js'
import {stylePresets} from '../src/style-library.js'
const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
function client(storage=new Map()) {return runInNewContext(source+'\n;({newDraft,chosen,applyStyleChoice,buildTaskCard,buildDesignPrompt,buildFinalDesignPrompt,selectDraftDirection,persistState,loadState,renderStylePicker,STYLE_BY_ID,LIGHTS,buildAnalysis})',{
 require:()=>({}),__SCENES__:[],__CSS__:'',__THREE__:'',__SCENE_RUNTIME__:'',__LENS_RUNTIME__:'',__STYLE_LIBRARY__:{styles:stylePresets},__REFERENCE_LIBRARY__:{templates,cases},
 localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}})}
test('selected visual rules reach the exported task and changing style invalidates an older refinement',()=>{
 const c=client(),state=c.newDraft('一台持续运转的蒸汽机')
 c.applyStyleChoice(state,'clay-soft');const first=c.buildDesignPrompt(state)
 state.refinement={source:first,brief:'旧的优化正文',templateIds:['layered-courtyard'],changes:[]}
 assert.match(c.buildFinalDesignPrompt(state),/旧的优化正文/)
 c.applyStyleChoice(state,'brass');const task=c.buildTaskCard(state)
 assert.ok(task.includes(c.STYLE_BY_ID.get('brass').prompt))
 assert.ok(!task.includes(c.STYLE_BY_ID.get('clay-soft').prompt));assert.doesNotMatch(task,/旧的优化正文/)
})
test('unconstrained style is explicit, exported, and survives direction changes and reload',()=>{
 const storage=new Map(),c=client(storage),state=c.newDraft('晴天草地风车')
 c.applyStyleChoice(state,'clay-soft');const oldPalette=state.paletteId
 c.applyStyleChoice(state,'unconstrained')
 assert.notEqual(state.paletteId,oldPalette);assert.equal(c.chosen(state).style.id,'unconstrained')
 const task=c.buildTaskCard(state);assert.match(task,/不附加任何预设美术风格/)
 assert.ok(!task.includes(c.STYLE_BY_ID.get('clay-soft').prompt))
 c.selectDraftDirection(state,state.analysis.directions[1]);assert.equal(c.chosen(state).style.id,'unconstrained')
 c.persistState(state);assert.equal(client(storage).loadState().styleChoice,'unconstrained')
 assert.match(c.renderStylePicker(state,true),/data-value="unconstrained" aria-pressed="true"/)
})
test('unconstrained style retains intentional custom colors and the selected light',()=>{
 const c=client(),state=c.newDraft('一台工业发动机')
 state.customColors=['#112233','#223344','#334455','#445566','#556677','#667788'];state.lightId='dusk'
 c.applyStyleChoice(state,'unconstrained');const task=c.buildTaskCard(state)
 for(const color of state.customColors)assert.ok(task.includes(color))
 assert.ok(task.includes(c.LIGHTS.find(l=>l.id==='dusk').line))
 assert.equal(c.applyStyleChoice(state,'missing-style'),false)
})
