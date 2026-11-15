import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createFullSceneService } from '../src/full-scene.js'
const url='http://localhost/api/miniature-atelier/full-scene'
const request = (body) => new Request(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
async function fixture(t,{review=true,changes=0,pass=true,gate,imageError=false}={}) {
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ma-full-test-'))
 t.after(()=>fs.rm(directory,{recursive:true,force:true}))
 const events=[],messages=[],selected=[];let cwd,turn=0,verifications=0
 const agent={id:'session-fixture',options:{},model:{select:s=>selected.push(s)},session:{snapshotEvents:()=>[...events]},cancel(){gate?.resolve()},
 followup(m){messages.push(m.content[0].text)},async whenIdle(){
  turn++
  if(turn===1){await fs.writeFile(path.join(cwd,'scene.js'),'// fresh scene source');await gate?.promise}
  else {
   if(review) for(const file of ['1600x1000.png','500x800.png']) {
    const callId='image-'+turn+'-'+file
    events.push({type:'tool/call',data:{callId,name:'read_image',arguments:JSON.stringify({path:path.join(cwd,file)})}})
    events.push({type:'tool/result',data:{message:{toolCallId:callId,isError:imageError,content:imageError?[{type:'text',text:'image unavailable'}]:[{type:'image',data:'fixture'}]}}})
   }
   if(turn<=changes+1) await fs.appendFile(path.join(cwd,'scene.js'),'\n// visual repair '+turn)
  }
  events.push({type:'turn/end',data:{reason:{kind:'completed'}}})
 }}
 const runtime={async createSession(o){cwd=o.cwd;return{agent}},async resolveAgent(){return{agent}}}
 const service=createFullSceneService({sessionController:{agents:runtime}},{store:path.join(directory,'jobs'),enginePath:new URL('../src/three.min.js',import.meta.url),
 async verify(){verifications++;return {html:'<!doctype html><canvas></canvas>',report:{ok:pass,checks:{offline:pass},errors:[],external:[],views:[],thumbnail:'data:image/jpeg;base64,a'}}}})
 t.after(()=>service.dispose())
 return {service,directory,agent,messages,selected,get verifications(){return verifications},async start(extra={}){return service.fetch(request({workspace:directory,title:'余烬工坊',prompt:'完整办公室剖面制作要求。'.repeat(20),...extra}))},async done(){await Promise.all([...service.tasks.values()]);return [...service.jobs.values()][0]}}
}
test('full generation uses native tools with high reasoning and only publishes after screenshot review',async t=>{
 const f=await fixture(t);const response=await f.start({requestId:'one'});assert.equal(response.status,202)
 const id=(await response.json()).job.id
 const job=await f.done();assert.equal(job.status,'completed');assert.equal(job.reviewed,true)
 assert.deepEqual(f.selected,[{provider:'deepseek-account',model:'deepseek-flash',reasoningEffort:'high'}])
 assert.equal(f.agent.options.maxTokens,256000)
 assert.match(f.messages[0],/scene.js/);assert.match(f.messages[0],/不要输出JSON/)
 assert.match(await fs.readFile(path.join(job.directory,'preview.mjs'),'utf8'),/verifyFullScene/)
 assert.match(f.messages[0],/node preview.mjs/)
 const result=await(await f.service.fetch(new Request(url+'?id='+id+'&result=1'))).json()
 assert.match(result.job.html,/canvas/);assert.equal(result.job.sessionId,'session-fixture')
 assert.equal(f.verifications,1)
})
test('changed scene is verified and its NEW screenshots reviewed before publication',async t=>{
 const f=await fixture(t,{changes:1});await f.start();const job=await f.done()
 assert.equal(job.status,'completed');assert.equal(f.verifications,2);assert.equal(f.messages.length,3)
})
test('failed QA or skipped image inspection cannot become a completed primitive fallback',async t=>{
 for(const options of [{review:false},{pass:false},{imageError:true}]) {
 const f=await fixture(t,options);await f.start();const job=await f.done()
 assert.equal(job.status,'failed');assert.equal(job.reviewed,undefined)
 const data=await(await f.service.fetch(new Request(url+'?id='+job.id+'&result=1'))).json();assert.equal(data.job.html,undefined)
 }
})
test('simultaneous starts reserve one job, duplicate request IDs reuse it',async t=>{
 const gate=Promise.withResolvers();const f=await fixture(t,{gate})
 const responses=await Promise.all([f.start({requestId:'same'}),f.start({requestId:'second'})])
 assert.deepEqual(responses.map(r=>r.status).sort(),[202,409])
 const duplicate=await f.start({requestId:'same'});assert.equal(duplicate.status,200)
 assert.equal(f.service.jobs.size,1);gate.resolve();await f.done()
})
test('persisted interruption resumes through the host result wrapper and supports cancellation',async t=>{
 const gate=Promise.withResolvers();const f=await fixture(t,{gate});await f.start();
 const [job]=f.service.jobs.values();await f.service.fetch(request({action:'cancel',id:job.id}));gate.resolve();await f.done()
 assert.equal(job.status,'cancelled')
 const response=await f.service.fetch(request({action:'resume',id:job.id}));assert.equal(response.status,202)
 await f.done();assert.equal(job.status,'completed')
})
