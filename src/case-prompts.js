import fs from 'node:fs/promises'
import { cases, assembleReferenceCases } from './reference-library.js'

export function registerCasePrompts(ctx, requestSource = fetch) {
  let catalog, cache = new Map()
  ctx.connection.fetch.register({ path: '/api/miniature-atelier/case-prompt', methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    const json = (value, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
    try {
      const body = await request.text()
      if (body.length > 2000) throw new Error('请求过大')
      const input = JSON.parse(body)
      catalog ??= fs.readFile(new URL('./sandbase-cases.json', import.meta.url), 'utf8').then((s) => assembleReferenceCases(JSON.parse(s).records))
      const scene = [...cases, ...await catalog].find((item) => item.id === input.id)
      if (!scene) return json({ ok: false, error: '案例不存在' }, 404)
      const source = [scene.promptUrl, scene.url].find((s) => /^https:\/\/x\.com\/[^/]+\/status\/\d+/.test(s || ''))
      if (!source) return json({ ok: true, text: '', source: scene.url || '', basis: 'case-notes' })
      const postId = source.match(/\/status\/(\d+)/)[1]
      if (cache.has(postId)) return json({ ok: true, ...cache.get(postId) })
      const response = await requestSource('https://api.fxtwitter.com/status/' + postId, { signal: AbortSignal.any([request.signal, AbortSignal.timeout(8000)]) })
      if (!response.ok) throw new Error('原帖正文暂时无法读取')
      const data = await response.json()
      const text = typeof data.tweet?.text === 'string' ? data.tweet.text.slice(0, 22000) : ''
      const result = { text, source, basis: text ? 'original-post' : 'case-notes' }
      if (text) cache.set(postId, result)
      return json({ ok: true, ...result })
    } catch (error) { return json({ ok: false, error: error.message }, 400) }
  } })
}
