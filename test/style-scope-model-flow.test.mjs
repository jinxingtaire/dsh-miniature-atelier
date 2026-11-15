import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
import {stylePresets} from '../src/style-library.js'
import {scopeReference,normalizeStyleProfile} from '../src/creative-intent.js'

const profile={form:'简化几何，统一夸张比例与边缘倒角',line:'克制的细轮廓线，线宽随视觉层次变化',materials:'温润哑光表面，笔触化归纳微小细节',color:'低至中饱和有限色板，少量对比点色',light:'柔和漫射光与两三级明暗，暗面可读',render:'三维插画式着色，清楚的接触阴影',motion:'柔和缓动，低频循环，镜头稳定'}
const sourceRef={id:'test-ref',name:'参考图',analysis:{summary:'草坡、羊群、教堂、风车',geometry:'风车圆柱塔与河流小桥，草叶密集',materials:'塔身抹灰、草叶片状',lighting:'阳光照着风车',palette:['#ffffff']}}
async function client(storage=new Map()) {
 const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
 return runInNewContext(source+'\n;({STYLES,PALETTES,isNativeVisible,runModelCreation,renderModelLaunch,normalizeCustomStyle,newDraft,imageReferencePrompt,creativeIntentSource,renderCreativeIntent})',{
  require:()=>({}),__SCENES__:[],__CSS__:'',__THREE__:'',__SCENE_RUNTIME__:'',__LENS_RUNTIME__:'',__STYLE_LIBRARY__:{styles:stylePresets},__REFERENCE_LIBRARY__:{cases:[],templates:[]},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
 })
}

test('every preset defines transferable visual language without mandatory scenery',async()=>{
 const c=await client();assert.equal(c.STYLES.length,18)
 for(const style of c.STYLES) assert.doesNotMatch(style.prompt,/风车|羊群|草叶|地形|土层|教堂|齿轮|冰层|街区|沙海|楼梯|山石|树冠|植物|建筑|屋檐/,style.id)
})

test('style-only input cannot leak source subjects into downstream models or final reference blocks',async()=>{
 const intent={references:[{id:sourceRef.id,role:'style',styleProfile:profile}]}
 const scoped=scopeReference(sourceRef,{role:'style'},intent)
 assert.ok(scoped.analysis.styleProfile);assert.doesNotMatch(JSON.stringify(scoped),/草坡|羊群|教堂|风车|河流|小桥/)
 const subject=scopeReference(sourceRef,{role:'subject'},intent);assert.match(JSON.stringify(subject),/风车/)
 const c=await client(),state=c.newDraft('一台机器人');
 state.imageReferences=[{...sourceRef,id:'ref-12345678-1234-1234-1234-123456789012',role:'style',path:'/reference.jpg'}]
 state.creativeIntent={goal:'一台机器人',mustKeep:['机器人'],borrow:[],avoid:[],uncertainties:[],references:[{id:state.imageReferences[0].id,role:'style',styleProfile:profile}],source:c.creativeIntentSource(state)}
 const prompt=c.imageReferencePrompt(state)
 assert.match(prompt,/温润哑光/);assert.doesNotMatch(prompt,/草坡|羊群|教堂|风车|河流|小桥/)
 assert.match(c.renderCreativeIntent(state),/提炼的画风 · 不包含场景内容/)
 assert.equal(normalizeStyleProfile({...profile,form:'实例化草叶与圆柱风车'}),null)
})

test('old app-composed custom bases migrate, while user fields and separately authored prompts remain intact',async()=>{
 const c=await client();const value={id:'custom-12345678',label:'我的画风',colors:Array(6).fill('#eeeeee'),fields:{baseId:'pastoral-toon',geometry:'非常细的轮廓线'},prompt:'基础风格：田园绘本。草叶实例化，保留土层厚度。'}
 const migrated=c.normalizeCustomStyle(value);assert.match(migrated.prompt,/非常细的轮廓线/);assert.doesNotMatch(migrated.prompt,/草叶|土层/)
 assert.equal(c.normalizeCustomStyle({...value,prompt:'用户单独编写的柔光和浅米白背景画风规则。'}).prompt,'用户单独编写的柔光和浅米白背景画风规则。')
})

test('deferred image-to-model pipeline remains testable but its production entry is absent',async()=>{
 const {runModelCreation}=await client();const calls=[]
 await runModelCreation({prepare:async()=>{calls.push('read-and-ideate');return true},optimize:async()=>calls.push('optimize'),dispatch:async()=>{calls.push('production');return true},onPhase:phase=>calls.push(phase)})
 assert.deepEqual(calls,['preparing','read-and-ideate','optimizing','optimize','dispatching','production','sent'])
 for(const failure of ['prepare','optimize']) {
  let dispatched=false
  await assert.rejects(runModelCreation({prepare:async()=>failure!=='prepare',optimize:async()=>{throw Error('optimize failed')},dispatch:async()=>{dispatched=true},onPhase:()=>{}}))
  assert.equal(dispatched,false)
 }
 const html=(await client()).renderModelLaunch({imageReferences:[sourceRef],modelLaunch:{phase:'error',error:'优化失败，未发送'}},false)
 assert.equal(html,'')
})

// Regression: fixed-position host controls are visible even when offsetParent is null.
test('native dispatch admits visible fixed controls and excludes hidden controls',async()=>{
 const {isNativeVisible}=await client();
 assert.equal(isNativeVisible({offsetParent:null,getClientRects:()=>[{}]}),true);
 assert.equal(isNativeVisible({offsetParent:{},getClientRects:()=>[]}),false);
});

test('palette guides cannot reintroduce scene objects into a pure art direction',async()=>{
 const {PALETTES}=await client();
 for(const palette of PALETTES) assert.doesNotMatch(palette.prompt,/彩窗|烛火|门柱|窗口|暖窗|旗帜|室内灯窗/);
});
