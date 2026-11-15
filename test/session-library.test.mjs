import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { runInNewContext } from 'node:vm'
import { inspectSession, normalizeSessionId, registerSessionLibrary, sessionTimeline } from '../src/session-library.js'
import { templates, cases } from '../src/reference-library.js'
import { registerCasePrompts } from '../src/case-prompts.js'

test('tool timeline joins result IDs, exposes public summaries and omits reasoning/code payloads', () => {
  const events = [
    {type:'assistant/message',seq:1,time:100,data:{message:{content:[{type:'reasoning',text:'private chain'},{type:'text',text:'正在检查炉口遮挡。'}]}}},
    {type:'tool/call',seq:2,time:200,data:{callId:'one',name:'write',arguments:JSON.stringify({file_path:'/work/scene.js',content:'do not expose code',description:'构建办公室'})}},
    {type:'tool/call',seq:3,time:300,data:{callId:'two',name:'bash',arguments:JSON.stringify({command:'node preview.mjs',description:'离线验收'})}},
    {type:'tool/result',seq:4,time:450,data:{message:{toolCallId:'one',content:[{type:'text',text:'saved'}]}}},
    {type:'tool/result',seq:5,time:500,data:{message:{toolCallId:'two',isError:true,content:[{type:'text',text:'token=secret failure'}]}}},
    {type:'tool/call',seq:6,time:600,data:{callId:'three',name:'read_image',arguments:'{}'}},
  ]
  const timeline=sessionTimeline(events)
  assert.equal(timeline[1].status,'completed'); assert.equal(timeline[1].durationMs,250)
  assert.equal(timeline[2].status,'error'); assert.equal(timeline[3].status,'running')
  assert.match(timeline[2].result,/redacted/)
  assert.doesNotMatch(JSON.stringify(timeline),/private chain|do not expose code|secret/)
  assert.equal(sessionTimeline([...events,{type:'turn/end',seq:7,time:700}]).at(-1).status,'interrupted')
})

async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ma-import-'))
  t.after(()=>fs.rm(directory,{recursive:true,force:true}))
  await fs.mkdir(path.join(directory,'final'))
  const file=path.join(directory,'final','office.html')
  const html='<!doctype html><html><body><canvas></canvas><script>/*'+ 'complete '.repeat(40)+'*/</script></body></html>'
  await fs.writeFile(file,html)
  const events=[{type:'user/message',seq:0,data:{role:'user',content:[{type:'text',text:'【任务】余烬工坊\n【目标文件】'+file+'\n完整办公室焚纸制作。'}]}},
    {type:'assistant/message',seq:1,data:{message:{content:[{type:'text',text:'成品：[打开]('+file+')'}]}}}]
  const agent={id:'session-12345678',session:{header:{cwd:directory},snapshotEvents:()=>events}}
  return {directory,file,html,events,agent}
}

test('session inspection recovers actual prompts and referenced final HTML without scanning unrelated files',async t=>{
  const f=await fixture(t)
  await fs.writeFile(path.join(f.directory,'unrelated.html'),f.html)
  f.events.push({type:'tool/call',seq:2,data:{callId:'x',name:'bash',arguments:JSON.stringify({command:'cat /etc/secret.html'})}})
  const info=await inspectSession(f.agent)
  assert.equal(info.title,'余烬工坊');assert.match(info.prompt,/办公室焚纸/)
  assert.deepEqual(info.files.map(x=>x.path),[f.file])
  assert.equal(normalizeSessionId('dsh://session/session-12345678'),'session-12345678')
  assert.throws(()=>normalizeSessionId('../etc/passwd'))
  await fs.rm(f.file)
  assert.equal((await inspectSession(f.agent)).files.length,0)
})

test('import route only admits current session candidates, is deterministic, and does not dispatch work',async t=>{
  const f=await fixture(t), routes=new Map()
  registerSessionLibrary({connection:{fetch:{register:r=>routes.set(r.path,r)}},sessionController:{agents:{resolveAgent:async()=>({agent:f.agent})}}})
  const route=routes.values().next().value
  const request=body=>new Request('http://localhost'+route.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  const inspected=await(await route.fetch(request({sessionId:f.agent.id}))).json()
  assert.equal(inspected.session.html,undefined)
  const read=async()=> (await route.fetch(request({sessionId:f.agent.id,action:'import',path:f.file}))).json()
  const first=await read(), second=await read()
  assert.equal(first.session.html,f.html);assert.equal(first.session.id,second.session.id)
  assert.equal((await route.fetch(request({sessionId:f.agent.id,action:'import',path:'/etc/passwd'}))).status,400)
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'ma-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}))
  await fs.writeFile(path.join(outside,'hidden.html'),f.html)
  await fs.symlink(path.join(outside,'hidden.html'),path.join(f.directory,'link.html'))
  f.events[0].data.content[0].text+='\n./link.html'
  assert.equal((await inspectSession(f.agent)).files.length,1)
})

test('same-style brief retains the selected case subject; DSH is primary in both editors',async()=>{
  const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
  const api=runInNewContext(source+'\n;({buildSameStylePrompt,renderPromptEditor,newDraft,renderStep,referenceCard})',{
    require:()=>({}),__SCENES__:[],__CSS__:'',__THREE__:'',__SCENE_RUNTIME__:'',__LENS_RUNTIME__:'',__REFERENCE_LIBRARY__:{cases,templates},
  })
  const scene=cases.find(x=>x.id==='ref-paris-cafe'),template=templates.find(x=>x.id===scene.templateId)
  const brief=api.buildSameStylePrompt(scene,template)
  assert.match(brief,/【场景主题】\n巴黎街角咖啡馆/)
  assert.match(brief,/侧窗/);assert.doesNotMatch(brief,new RegExp(template.example))
  assert.doesNotMatch(api.referenceCard(scene,{references:[]},false,true),/data-ma-action="same-style"/)
  const editor=api.renderPromptEditor({templateId:template.id,sceneId:scene.id,mode:'same-style',text:brief},false)
  assert.match(editor,/ma-wbtn-primary[^>]*data-ma-action="launch-prompt"/)
  const state=api.newDraft('深夜办公室');state.step=6
  assert.match(api.renderStep(6,state),/ma-wbtn-primary[^>]*data-ma-action="launch-generation"/)
})

test('same-style source lookup uses catalog URLs and preserves original text without arbitrary URL fetches',async()=>{
  let route,calls=0
  registerCasePrompts({connection:{fetch:{register:r=>route=r}}},async url=>{
    calls++;assert.equal(url,'https://api.fxtwitter.com/status/2119766148980121838')
    return Response.json({tweet:{text:'Create a Paris corner cafe. Side windows show the same interior.'}})
  })
  const request=id=>new Request('http://localhost'+route.path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id,url:'http://localhost/private'})})
  const first=await(await route.fetch(request('ref-paris-cafe'))).json()
  assert.equal(first.basis,'original-post');assert.match(first.text,/Paris/)
  await route.fetch(request('ref-paris-cafe'));assert.equal(calls,1)
  assert.equal((await route.fetch(request('arbitrary'))).status,404)
})

test('unfinished source templates are excluded and the declared target precedes incidental HTML references',async t=>{
 const f=await fixture(t)
 const template=path.join(f.directory,'template.html'),other=path.join(f.directory,'old.html')
 await fs.writeFile(template,'<!doctype html><html><body><canvas></canvas><script>/*__THREE__*/</script><script>/*__SCENE__*/</script></body></html>')
 await fs.writeFile(other,f.html)
 f.events.push({type:'assistant/message',seq:10,data:{message:{content:[{type:'text',text:'对照文件 '+other+' 和源码模板 '+template}]}}})
 const info=await inspectSession(f.agent)
 assert.equal(info.files[0].path,f.file)
 assert.ok(!info.files.some(x=>x.path===template),'unassembled template is not a finished HTML')
 assert.equal(info.excludedFiles[0].path,template)
})
