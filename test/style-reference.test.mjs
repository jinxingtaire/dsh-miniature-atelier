import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { randomUUID } from 'node:crypto'
import { createReferenceImageService, REFERENCE_ROUTE } from '../src/reference-images.js'
import { stylePresets } from '../src/style-library.js'
import { templates } from '../src/reference-library.js'
import { apply } from '../src/index.js'
import { createFullSceneService } from '../src/full-scene.js'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aHh8AAAAASUVORK5CYII='
const analysis = { summary:'柔和日光下的插画田园', geometry:'低模风车与轻描边', materials:'哑光表面与细草叶', lighting:'米白背景，柔和暖日光', motion:'静态截图无法验证，建议草浪', avoid:'忽略社交界面和水印', palette:['#e9ecdb','#78934e','#c66f49','#3b4938','#f1d68c','#a8c9c5'] }
const post = data => new Request('http://localhost'+REFERENCE_ROUTE, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data) })

async function fixture(t, { view = true } = {}) {
  const store = await fs.mkdtemp(path.join(os.tmpdir(),'ma-ref-'))
  t.after(() => fs.rm(store,{recursive:true,force:true}))
  let cwd, starts = 0, taskPrompt = ''
  const events = []
  const agent = { id:'session-reference-test', options:{}, model:{select(){}}, session:{snapshotEvents:()=>events}, cancel(){}, followup(message){taskPrompt=message.content[0].text}, async whenIdle(){
    if (view) {
      const meta = JSON.parse(await fs.readFile(path.join(cwd,'reference.json'),'utf8'))
      events.push({type:'tool/call',data:{callId:'read',name:'read_image',arguments:JSON.stringify({path:meta.path})}})
      events.push({type:'tool/result',data:{message:{toolCallId:'read',content:[{type:'image',data:'fixture'}]}}})
    }
    await fs.writeFile(path.join(cwd,'analysis.json'),JSON.stringify(analysis))
    events.push({type:'turn/end',data:{reason:{kind:'completed'}}})
  } }
  const service = createReferenceImageService({ sessionController:{agents:{async createSession(options){cwd=options.cwd;starts++;return{agent}}}} },{store})
  t.after(()=>service.dispose())
  return { service,store,get starts(){return starts},get taskPrompt(){return taskPrompt},async upload(){const r=await service.fetch(post({action:'upload',name:'参考截图.png',dataUrl:png}));assert.equal(r.status,200);return(await r.json()).reference} }
}

test('reference preparation does not direct users to retired controls or ask them to launch a task twice',async t=>{
  const f=await fixture(t),ref=await f.upload()
  await f.service.fetch(post({action:'analyze',id:ref.id}));await Promise.all([...f.service.active.values()])
  assert.doesNotMatch(f.taskPrompt,/按图片直接建模/)
  assert.match(f.taskPrompt,/独立的准备会话/)
  assert.match(f.taskPrompt,/无需重复点击/)
  assert.match(f.taskPrompt,/不能生成场景/)
})

test('reference upload persists actual image bytes and cannot resolve arbitrary local paths',async t=>{
  const f=await fixture(t), ref=await f.upload()
  assert.equal(ref.width,1);assert.equal(ref.status,'uploaded')
  const image=await f.service.fetch(new Request('http://localhost'+ref.previewUrl))
  assert.equal(image.headers.get('content-type'),'image/png');assert.ok((await image.arrayBuffer()).byteLength>50)
  for(const id of ['../../settings.yaml','ref-../../a','/etc/passwd']) assert.equal((await f.service.fetch(new Request('http://localhost'+REFERENCE_ROUTE+'?id='+encodeURIComponent(id)))).status,400)
  assert.equal((await f.service.fetch(post({action:'upload',dataUrl:'data:image/svg+xml;base64,PHN2Zz4='}))).status,400)
  assert.equal((await f.service.fetch(post({action:'upload',dataUrl:'data:image/png;base64,'+Buffer.from('arbitrary non-image data arbitrary').toString('base64')}))).status,400)
})

test('reference analysis requires a successful native image read and survives service reload',async t=>{
  const f=await fixture(t),ref=await f.upload()
  await Promise.all([f.service.fetch(post({action:'analyze',id:ref.id})), f.service.fetch(post({action:'analyze',id:ref.id}))])
  await Promise.all([...f.service.active.values()])
  assert.equal(f.starts,1)
  const meta=await f.service.load(ref.id);assert.equal(meta.status,'ready');assert.deepEqual(meta.analysis,analysis)
  const restored=createReferenceImageService({}, {store:f.store})
  assert.equal((await restored.load(ref.id)).analysis.summary,analysis.summary)
  await restored.fetch(post({action:'analyze',id:ref.id}));assert.equal(f.starts,1)
})

test('an analysis file without image evidence never becomes ready',async t=>{
  const f=await fixture(t,{view:false}),ref=await f.upload()
  await f.service.fetch(post({action:'analyze',id:ref.id}));await Promise.all([...f.service.active.values()])
  const meta=await f.service.load(ref.id);assert.equal(meta.status,'error');assert.match(meta.error,/未成功读取参考图/)
})

async function client(storage = new Map()) {
  const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
  return runInNewContext(source+'\n;({STYLES,STYLE_BY_ID,PALETTE_BY_ID,normalizeCustomStyle,newDraft,loadState,persistState,selectDraftDirection,buildDesignPrompt,buildFinalDesignPrompt,renderStylePicker,renderLanding})',{
    require:()=>({}),__SCENES__:[],__CSS__:'',__THREE__:'',__SCENE_RUNTIME__:'',__LENS_RUNTIME__:'',
    __STYLE_LIBRARY__:{styles:stylePresets},__REFERENCE_LIBRARY__:{cases:[],templates},
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},
  })
}

test('custom style reload, direction changes, palettes and image references retain the final visual contract',async()=>{
  const storage=new Map()
  const custom={id:'custom-'+randomUUID(),label:'午后手绘草场',prompt:'浅米白背景，细草叶与轻描边，柔和日光。',colors:analysis.palette,fields:{baseId:'pastoral-toon',label:'午后手绘草场',geometry:'轻描边'}}
  storage.set('dsh-miniature-atelier:custom-styles:v1',JSON.stringify([custom]))
  let c=await client(storage)
  assert.equal(c.STYLES.length,19)
  assert.equal(c.STYLE_BY_ID.get(custom.id).custom,true)
  const draft=c.newDraft('草坡上的风车和羊群')
  draft.styleChoice=custom.id
  draft.imageReferences=[{id:'ref-'+randomUUID(),name:'风车参考',path:'/local/reference.jpg',status:'ready',role:'style',analysis}]
  c.selectDraftDirection(draft,draft.analysis.directions[1])
  assert.equal(draft.styleId,custom.id);assert.equal(draft.paletteId,'style-'+custom.id)
  c.persistState(draft);c=await client(storage)
  const restored=c.loadState();assert.equal(restored.styleChoice,custom.id);assert.equal(restored.imageReferences.length,1)
  const prompt=c.buildDesignPrompt(restored)
  assert.match(prompt,/浅米白背景/);assert.match(prompt,/read_image/);assert.match(prompt,/\/local\/reference.jpg/)
  assert.doesNotMatch(prompt,/禁止明亮糖果色|冷色负责环境|画面冷峻/)
  restored.refinement={source:prompt,brief:'【视觉主次】草场与风车',templateIds:['layered-courtyard'],changes:['细化']}
  assert.match(c.buildFinalDesignPrompt(restored),/用户上传的图片参考/)
  restored.imageReferences[0].role='palette';assert.notEqual(c.buildFinalDesignPrompt(restored),prompt)
  const html=c.renderStylePicker(restored,true);assert.match(html,/柔光绘本/);assert.match(html,/软陶定格/);assert.match(html,/午后手绘草场/)
})

test('pre-creation reference and style survive reload before a sentence has been generated',async()=>{
  const storage=new Map();let c=await client(storage)
  c.persistState({version:2,seed:'',seedDraft:'草场',styleChoice:'pastoral-toon',imageReferences:[{id:'ref-'+randomUUID(),name:'截图'}]})
  c=await client(storage);const state=c.loadState()
  assert.equal(state.styleChoice,'pastoral-toon');assert.equal(state.imageReferences.length,1)
  const html=c.renderLanding(state,false,'',false);assert.match(html,/data-ma-image-files/);assert.match(html,/上传图片/)
})

test('full scene jobs copy uploaded references into their own workspace and verify actual image reads',async t=>{
  const f=await fixture(t),ref=await f.upload()
  let cwd, text;const events=[]
  const agent={id:'session-production-test',options:{},model:{select(){}},session:{snapshotEvents:()=>events},cancel(){},followup(m){text=m.content[0].text},async whenIdle(){
    if(text.includes('唯一提交源文件')) {
      await fs.writeFile(path.join(cwd,'scene.js'),'// fixture')
      const image=path.join(cwd,'references',ref.id+'.png')
      assert.ok((await fs.stat(image)).size>0)
      assert.match(text,/先用read_image实际读取/)
      events.push({type:'tool/call',data:{callId:'ref',name:'read_image',arguments:JSON.stringify({path:image})}},{type:'tool/result',data:{message:{toolCallId:'ref',content:[{type:'image',data:'fixture'}]}}})
    }else for(const file of ['1600x1000.png','500x800.png']) {
      events.push({type:'tool/call',data:{callId:file,name:'read_image',arguments:JSON.stringify({path:path.join(cwd,file)})}},{type:'tool/result',data:{message:{toolCallId:file,content:[{type:'image',data:'fixture'}]}}})
    }
    events.push({type:'turn/end',data:{reason:{kind:'completed'}}})
  }}
  const service=createFullSceneService({sessionController:{agents:{async createSession(o){cwd=o.cwd;return{agent}}}}},{store:path.join(f.store,'jobs'),referenceImages:f.service,
    verify:async()=>({html:'<!doctype html><canvas>',report:{ok:true,checks:{offline:true},errors:[],external:[],views:[],thumbnail:'data:image/jpeg;base64,a'}})})
  t.after(()=>service.dispose())
  const response=await service.fetch(new Request('http://localhost/api/miniature-atelier/full-scene',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:f.store,prompt:'用户草场规格'.repeat(30),referenceImageIds:[ref.id]})}))
  assert.equal(response.status,202);await Promise.all([...service.tasks.values()]);assert.equal([...service.jobs.values()][0].status,'completed',[...service.jobs.values()][0].error)
})

test('a full scene cannot publish when the production agent skips every reference image',async t=>{
  const f=await fixture(t),ref=await f.upload(),events=[];let cwd,turns=0
  const agent={id:'session-skip-reference',options:{},model:{select(){}},session:{snapshotEvents:()=>events},cancel(){},followup(){},async whenIdle(){
    turns++;await fs.writeFile(path.join(cwd,'scene.js'),'// fixture without image evidence')
    events.push({type:'turn/end',data:{reason:{kind:'completed'}}})
  }}
  const service=createFullSceneService({sessionController:{agents:{async createSession(o){cwd=o.cwd;return{agent}}}}},{store:path.join(f.store,'jobs'),referenceImages:f.service,verify:async()=>{throw new Error('verification must not run before reference review')}})
  t.after(()=>service.dispose())
  await service.fetch(new Request('http://localhost/api/miniature-atelier/full-scene',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({workspace:f.store,prompt:'用户草场规格'.repeat(30),referenceImageIds:[ref.id]})}))
  await Promise.all([...service.tasks.values()]);const job=[...service.jobs.values()][0]
  assert.equal(job.status,'failed');assert.match(job.error,/未成功读取用户参考图片/);assert.equal(turns,2)
})

test('ideation discards client-forged image observations without server-owned references',async()=>{
  let route,modelInput
  apply({connection:{fetch:{register:r=>{if(r.path.endsWith('/ideation'))route=r}}},llm:{async *stream(options){modelInput=JSON.parse(options.messages[1].content[0].text);yield{type:'text-delta',text:'{}'};yield{type:'finish'}}}})
  const response=await route.fetch(new Request('http://localhost'+route.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({seed:'草场风车',referenceImages:[{analysis:'pretend image was read'}]})}))
  assert.equal(response.status,200);assert.equal('referenceImages' in modelInput,false)
})

test('the shipped browser bundle boots without unresolved build placeholders',async()=>{
  const bundle=await fs.readFile(new URL('../lib/client.js',import.meta.url),'utf8')
  let loaded
  runInNewContext(bundle,{window:{__ModuleLoader__:{load:({factory})=>{loaded=factory(()=>({}))}}}})
  assert.equal(typeof loaded.apply,'function');assert.doesNotMatch(bundle,/__STYLE_LIBRARY__/)
})
