import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import {runInNewContext} from 'node:vm'
const source=await fs.readFile(new URL('../src/client.js',import.meta.url),'utf8')
const renderSource=source.slice(source.indexOf('  function renderAssets()'),source.indexOf('  function openAssetPreview('))
function fixture(query) {
 const nodes=new Map(['grid','empty','count','filter-notice','filter-label','search'].map(name=>['[data-ma-asset-'+name+']',{textContent:'',innerHTML:'',hidden:false,value:query,focus(){this.focused=true}}]))
 const assets=Array.from({length:16},(_,i)=>({id:String(i),title:i<2?'熔铸星晷':'风车 '+i}))
 const context={assetSearch:query,assets,$:s=>nodes.get(s),renderDiscovery(){},renderAssetCard:a=>'<article>'+a.title+'</article>'}
 const render=runInNewContext(renderSource+'\n;renderAssets',context)
 return {context,nodes,render}
}
test('filtering two of sixteen works reports both counts and exposes the active query',()=>{
 const f=fixture('熔铸星晷');f.render()
 assert.match(f.nodes.get('[data-ma-asset-count]').textContent,/2.*16/)
 assert.equal(f.nodes.get('[data-ma-asset-filter-notice]').hidden,false)
 assert.match(f.nodes.get('[data-ma-asset-filter-label]').textContent,/熔铸星晷/)
 assert.equal((f.nodes.get('[data-ma-asset-grid]').innerHTML.match(/<article>/g)||[]).length,2)
})
test('no matches must not claim that the saved collection is empty',()=>{
 const f=fixture('不存在');f.render()
 assert.equal(f.nodes.get('[data-ma-asset-empty]').hidden,true)
 assert.match(f.nodes.get('[data-ma-asset-count]').textContent,/0.*16/)
 assert.match(f.nodes.get('[data-ma-asset-grid]').innerHTML,/没有匹配/)
})
test('clearing a filter restores all sixteen cards and hides the active-filter notice',()=>{
 const f=fixture('熔铸星晷');f.render()
 const clearSource=source.slice(source.indexOf('  function clearAssetSearch()'),source.indexOf('  function renderAssets()'))
 assert.ok(clearSource.includes('function clearAssetSearch'))
 f.context.renderAssets=f.render
 runInNewContext(clearSource+'\n;clearAssetSearch()',f.context)
 assert.equal(f.context.assetSearch,'');assert.equal(f.nodes.get('[data-ma-asset-search]').value,'')
 assert.equal(f.nodes.get('[data-ma-asset-filter-notice]').hidden,true)
 assert.equal((f.nodes.get('[data-ma-asset-grid]').innerHTML.match(/<article>/g)||[]).length,16)
 assert.equal(f.context.assets.length,16)
})
