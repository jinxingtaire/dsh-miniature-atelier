import assert from 'node:assert/strict'
import test from 'node:test'
import { apply } from '../src/index.js'
import { MODELING_PARAMETER_PATH } from '../src/modeling-parameters.js'

test('the planning route sends the specific request through the authenticated model, validates workstations and drops untrusted image observations', async () => {
  let input
  const routes = new Map()
  const payload = {
    mode: 'factory', subject: '果汁瓶清洗后灌装，灌装每件8秒，两台灌装机',
    referenceImages: [{analysis:'fake client observations'}],
  }
  const post = data => new Request('http://localhost' + MODELING_PARAMETER_PATH, {
    method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data),
  })
  let machines = 2
  apply({connection:{fetch:{register:route=>routes.set(route.path,route)}},llm:{async *stream(options) {
    assert.equal(options.provider, 'deepseek-account')
    input = JSON.parse(options.messages[1].content[0].text)
    yield {type:'text-delta',text:JSON.stringify({
      title:'果汁灌装线', arrival:3, buffer:4, assumptions:'到料与缓冲为演示估算',
      stations:[{name:'洗瓶',seconds:2,machines:1},{name:'灌装',seconds:8,machines}],
    })}
    yield {type:'finish'}
  }}})
  const route = routes.get(MODELING_PARAMETER_PATH)
  const result = await route.fetch(post(payload))
  assert.equal(result.status,200)
  assert.equal(input.subject,payload.subject)
  assert.deepEqual(input.referenceImages,[])
  assert.equal((await result.json()).parameters.relations,'洗瓶 | 2 | 1\n灌装 | 8 | 2')
  machines = 1.5
  assert.equal((await route.fetch(post(payload))).ok,false)
  assert.equal((await route.fetch(post({...payload,mode:'constructor'}))).status,400)
})
