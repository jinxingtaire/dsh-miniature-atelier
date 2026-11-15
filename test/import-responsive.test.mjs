import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import {runInNewContext} from 'node:vm'

const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
const saveSource=source.slice(source.indexOf('  async function saveGeneratedAsset('),source.indexOf('  function reportSavedAsset('))
function fixture({capture,write=async()=>{}}={}) {
 const context={assetsLoaded:Promise.resolve(),assets:[],Date,Math,console,
  captureAssetThumbnail:capture,writeAsset:write,renderAssets(){},root:{isConnected:true},
  async storeCover(previous,thumbnail) {
    const updated = {...previous,thumbnail};
    await write(updated);
    context.assets = [updated];
  }}
 return {context,save:runInNewContext(saveSource+'\n;saveGeneratedAsset',context)}
}

test('session import persists HTML and returns before an unresponsive cover finishes',async()=>{
 const writes=[], f=fixture({capture:()=>new Promise(()=>{}),write:async asset=>writes.push({...asset})})
 const pending=f.save({title:'成品'},'DSH',new AbortController().signal,{id:'finished',html:'<html><canvas></canvas></html>',allowMissingThumbnail:true})
 const result=await Promise.race([pending,new Promise(resolve=>setTimeout(()=>resolve('still-waiting'),40))])
 assert.notEqual(result,'still-waiting','optional cover generation must not block adding a finished HTML')
 assert.equal(result.saved,true);assert.equal(writes[0].html,'<html><canvas></canvas></html>')
})

test('late cover updates the saved work while a missing cover still leaves a usable HTML',async()=>{
 let release;const writes=[]
 const f=fixture({capture:()=>new Promise(resolve=>release=resolve),write:async a=>writes.push({...a})})
 const done=await f.save({title:'成品'},'DSH',new AbortController().signal,{id:'finished',html:'<html>actual</html>',allowMissingThumbnail:true})
 assert.equal(done.saved,true);release('data:image/webp;base64,a')
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(f.context.assets[0].thumbnail,'data:image/webp;base64,a')
 assert.equal(writes.at(-1).html,'<html>actual</html>')
})
