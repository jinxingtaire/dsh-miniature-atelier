import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {runInNewContext} from 'node:vm'
import {discoverSessionScenes,registerSessionLibrary} from '../src/session-library.js'
import {templates,cases} from '../src/reference-library.js'
const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
const api=runInNewContext(source+'\n;({buildRevisionPrompt,createFreeDraft,renderDiscoveredScenes,STATIC_HTML})',{
 require:()=>({}),__SCENES__:[],__CSS__:'',__THREE__:'',__SCENE_RUNTIME__:'',__LENS_RUNTIME__:'',__REFERENCE_LIBRARY__:{templates,cases}})

test('discovery reads visible completed sessions without resuming agents, ignores unrelated pages, and closes every handle',async t=>{
 const cwd=await fs.mkdtemp(path.join(os.tmpdir(),'ma-discover-'));t.after(()=>fs.rm(cwd,{recursive:true,force:true}))
 const html='<!doctype html><html><canvas></canvas><script>'+ '/*scene*/'.repeat(40)+'</script></html>'
 await fs.writeFile(path.join(cwd,'final.html'),html)
 let closed=0;const opened=[]
 const ctx={sessionController:{list:async()=>({items:[{sessionId:'session-scene',updatedAt:3},{sessionId:'session-running',running:true,updatedAt:4},{sessionId:'session-unrelated',updatedAt:2},{sessionId:'session-error',updatedAt:1}]})},
 sessionPersistence:{open:async(id,mode)=>{assert.equal(mode,'read');opened.push(id);return {header:{cwd},async read(){if(id==='session-error')throw Error('corrupt');return {events:[{type:'user/message',data:{content:[{type:'text',text:id==='session-scene'?'【任务】微缩风车\n【目标文件】./final.html':'普通网页 ./final.html'}]}}]}},async close(){closed++}}}}}
 const result=await discoverSessionScenes(ctx)
 assert.equal(result.items.length,1);assert.equal(result.items[0].file.path,await fs.realpath(path.join(cwd,'final.html')))
 assert.equal(closed,3);assert.ok(!opened.includes('session-running'));assert.equal(result.running,1);assert.equal(result.unreadable,1)
 assert.equal(result.nextCursor,null);assert.equal(result.scanned,4)
 assert.equal(result.items[0].prompt,undefined,'search response contains compact metadata, not full conversations')
})

test('discovery has bounded batches and is exposed without requiring a pasted session ID',async()=>{
 let reads=0,route
 const ctx={connection:{fetch:{register:r=>route=r}},sessionController:{list:async()=>({items:Array.from({length:31},(_,i)=>({sessionId:'session-'+i,updatedAt:100-i}))})},
 sessionPersistence:{open:async()=>({header:{},read:async()=>{reads++;return {events:[]}},close:async()=>{}})}}
 registerSessionLibrary(ctx)
 const response=await route.fetch(new Request('http://local/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'discover'})}))
 const result=(await response.json()).discovery
 assert.equal(reads,30);assert.equal(result.nextCursor,30)
 const older=await discoverSessionScenes(ctx,{cursor:30});assert.equal(reads,31);assert.equal(older.nextCursor,null)
})

test('searchable discovery distinguishes an already saved file from other files in the same session',()=>{
 const item={sessionId:'session-found',title:'田园风车',cwd:'/work',updatedAt:1,file:{path:'/work/final.html',name:'final.html',bytes:780000},fileCount:2}
 const saved=[{id:'asset-saved',sessionId:item.sessionId,sourcePath:item.file.path}]
 assert.match(api.renderDiscoveredScenes([item],saved,'风车'),/已收藏 · 打开/)
 assert.match(api.renderDiscoveredScenes([item],[{...saved[0],sourcePath:'/work/template.html'}],''),/导入成品/)
 assert.doesNotMatch(api.renderDiscoveredScenes([item],[],'不存在'),/data-ma-action="import-discovered"/)
 assert.match(api.STATIC_HTML,/刷新自动检索/);assert.match(api.STATIC_HTML,/先编辑修改稿/);assert.match(api.STATIC_HTML,/在 DSH 修改/)
})

const revisionSource=source.slice(source.indexOf('  async function createAssetRevision('),source.indexOf('  function onClick('))
function revisionFixture() {
 const fields=new Map([['[data-ma-revision-source]',{value:'/work/original.html'}],['[data-ma-revision-changes]',{value:'把暗部提亮'}],['[data-ma-revision-keep]',{value:'保留主体和钟面'}],['[data-ma-revision-status]',{textContent:''}]])
 const events=[],workspace={drafts:{}}
 const ctx={revisionBusy:false,root:{isConnected:true},state:{workspace:'./miniature-runs'},promptWorkspace:workspace,
 findAsset:()=>({id:'original',title:'星晷'}),$:s=>fields.get(s),buildRevisionPrompt:api.buildRevisionPrompt,createFreeDraft:api.createFreeDraft,migrateWorkspace:x=>x,
 closeAssetPreview:()=>events.push('close'),setPromptEditing:()=>events.push('draft-saved'),showToast:()=>{},handoffTask:async task=>events.push(task)}
 return {run:runInNewContext(revisionSource+'\n;createAssetRevision',ctx),workspace,events,fields,ctx}
}

test('direct revision saves the editable draft before dispatch, while draft-only never dispatches',async()=>{
 const f=revisionFixture();await f.run(true,{disabled:false})
 assert.equal(Object.values(f.workspace.drafts).length,1)
 assert.equal(f.events[1],'draft-saved');assert.match(f.events[2],/把暗部提亮/)
 assert.match(f.events[2],/禁止覆盖或删除原文件/);assert.match(f.events[2],/【原作品】\/work\/original.html/)
 const draft=revisionFixture();await draft.run(false,{disabled:false});assert.equal(draft.events.length,2)
})

test('missing revision requirements and duplicate clicks cannot launch an unintended task',async()=>{
 const f=revisionFixture();f.fields.get('[data-ma-revision-changes]').value='';await f.run(true,{disabled:false});assert.equal(f.events.length,0)
 assert.match(f.fields.get('[data-ma-revision-status]').textContent,/请填写/)
 const pending=revisionFixture();let finish;pending.ctx.handoffTask=()=>new Promise(resolve=>finish=resolve)
 const first=pending.run(true,{disabled:false});await pending.run(true,{disabled:false})
 assert.equal(Object.values(pending.workspace.drafts).length,1);finish();await first
})
