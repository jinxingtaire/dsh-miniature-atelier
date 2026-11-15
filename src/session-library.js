import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const ROUTE = '/api/miniature-atelier/session-import'
const textOf = (message) => (message?.content || []).filter((part) => part.type === 'text').map((part) => part.text || '').join('\n')
const clean = (text, limit = 600) => String(text || '')
  .replace(/((?:api[_-]?key|authorization|password|token)\s*[:=]\s*)\S+/gi, '$1[redacted]')
  .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, limit)

// Only public message text and observable tool events; never reasoning blocks.
export function sessionTimeline(events, limit = 80) {
  const results = new Map(events.filter((e) => e.type === 'tool/result').map((e) => [e.data?.message?.toolCallId, e]))
  const endedSeq = events.findLast((e) => e.type === 'turn/end')?.seq ?? -1
  const timeline = []
  for (const event of events) {
    if (event.type === 'assistant/message') {
      const text = textOf(event.data?.message)
      if (text.trim()) timeline.push({ id: 'message-' + event.seq, kind: 'summary', time: event.time, text: clean(text, 700) })
    }
    if (event.type !== 'tool/call') continue
    const call = event.data || {}, result = results.get(call.callId)
    let args = {}
    try { args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments || {} } catch {}
    const file = args.file_path || args.path || ''
    timeline.push({ id: call.callId, kind: 'tool', time: event.time, name: clean(call.name, 80),
      text: clean(args.description || (file ? '文件：' + file : call.name), 350),
      status: result ? result.data.message.isError ? 'error' : 'completed' : endedSeq > event.seq ? 'interrupted' : 'running',
      detail: clean(file || args.command || args.cmd || '', 800),
      result: result ? clean(textOf(result.data.message) || (result.data.message.content?.some((p) => p.type === 'image') ? '已读取图像' : '执行完成'), 500) : '',
      durationMs: result && event.time ? Math.max(0, result.time - event.time) : null })
  }
  return timeline.slice(-limit)
}

export function normalizeSessionId(input) {
  const match = String(input || '').match(/\bsession-[a-zA-Z0-9-]{6,120}\b/)
  if (!match) throw new Error('请输入有效的 DSH 会话 ID（session-…）或包含它的链接')
  return match[0]
}

function htmlPaths(text) {
  const found = []
  // Absolute paths (including spaces in Markdown links), then relative filenames.
  for (const match of String(text).matchAll(/\]\((?:file:\/\/)?(\/[^)\n]+?\.html?)\)|(?:^|["'`\s(：:=】])((?:\/|\.\/|\.\.\/)[^\s"'`<>|;)]+?\.html?)\b|\b([\w.-]+\.html?)\b/gi)) {
    found.push(match[1] || match[2] || match[3])
  }
  return found
}

export async function inspectSession(agent) {
  const events = agent.session.snapshotEvents()
  const cwd = agent.session.header?.cwd
  if (!cwd || !path.isAbsolute(cwd)) throw new Error('该会话缺少可读取的本地工作区')
  const realCwd = await fs.realpath(cwd)
  const users = events.filter((e) => e.type === 'user/message').map((e) => textOf(e.data?.message || e.data)).filter(Boolean)
  if (!users.length) throw new Error('该会话没有可导入的用户提示词')
  let prompt = users.findLast((s) => /【完整设计规格】|【场景主题】|【任务】/.test(s)) || users[0]
  // Full-code jobs put the actual design in brief.md, explicitly named by their user task.
  if (/设计素材[：:]\s*本目录\s*brief\.md/.test(prompt)) {
    try { prompt = await fs.readFile(path.join(realCwd, 'brief.md'), 'utf8') } catch {}
  }
  const candidates = new Map()
  const targets = new Set(htmlPaths(prompt.match(/【目标文件】\s*([^\n]+)/)?.[1] || '').map(file => path.resolve(realCwd, file)))
  function add(text, priority, seq = 0) {
    for (const file of htmlPaths(text)) {
      const absolute = path.resolve(realCwd, file)
      if (!/\.html?$/i.test(absolute)) continue
      const score = priority + seq / Math.max(1, events.length)
      if (!candidates.has(absolute) || candidates.get(absolute).score < score) candidates.set(absolute, { path: absolute, score })
    }
  }
  users.forEach((s) => add(s, 40))
  for (const event of events) {
    if (event.type === 'assistant/message') add(textOf(event.data?.message), 80, event.seq)
    if (event.type === 'tool/call') {
      let args
      try { args = typeof event.data.arguments === 'string' ? JSON.parse(event.data.arguments) : event.data.arguments } catch { continue }
      // Ignore code bodies; read only output paths or command text, never execute commands.
      add(' ' + (args?.file_path || args?.path || args?.command || args?.cmd || ''), /write|edit/.test(event.data.name) ? 60 : 20, event.seq)
    }
  }
  const files = [], excludedFiles = []
  for (const candidate of [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 60)) {
    try {
      const real = await fs.realpath(candidate.path)
      if (path.relative(realCwd, real).startsWith('..')) continue
      const stat = await fs.stat(real)
      if (!stat.isFile() || stat.size < 100 || stat.size > 8_000_000) continue
      const html = await fs.readFile(real, 'utf8')
      if (!/<(?:!doctype\s+html|html|canvas)\b/i.test(html)) continue
      if (/\/\*\s*__(?:THREE|SCENE)__\s*\*\//.test(html)) {
        excludedFiles.push({ path: candidate.path, name: path.relative(realCwd, real), reason: '未组装的源码模板，不是成品' })
        continue
      }
      files.push({ path: candidate.path, name: path.relative(realCwd, real), bytes: stat.size, modifiedAt: stat.mtimeMs,
        rank: (targets.has(candidate.path) ? 1000 : 0) + candidate.score - (/^(?:template|test|preview)\.html?$/i.test(path.basename(real)) ? 200 : 0) })
    } catch {}
  }
  files.sort((a, b) => b.rank - a.rank || b.modifiedAt - a.modifiedAt)
  files.forEach(file => { delete file.rank })
  const title = prompt.match(/【(?:项目|任务)】\s*([^\n]+)/)?.[1]?.trim()
    || prompt.match(/【场景主题】\s*([^\n]+)/)?.[1]?.trim() || '会话导入作品'
  return { sessionId: agent.id, title: title.slice(0, 80), prompt: prompt.slice(0, 60000),
    messages: users.slice(-12).map((text) => text.slice(0, 30000)), files, excludedFiles, timeline: sessionTimeline(events),
    toolCalls: events.filter((e) => e.type === 'tool/call').length }
}

// Discovery opens cold sessions read-only; it never resumes an Agent or calls a model.
export async function discoverSessionScenes(ctx, { cursor = 0, signal } = {}) {
  const persistence = ctx.sessionPersistence || ctx.get?.('sessionPersistence')
  if (!ctx.sessionController?.list || !persistence?.open) throw new Error('当前 DSH 未提供自动检索接口，可继续用会话 ID 导入。')
  const listed = await ctx.sessionController.list({}, signal)
  const rows = (listed.items || []).filter(row => !row.blank && !row.parentSessionId && row.formatStatus !== 'unsupported')
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const offset = Math.max(0, Math.trunc(Number(cursor) || 0)), batch = rows.slice(offset, offset + 30)
  const items = []; let unreadable = 0, running = 0, index = 0
  await Promise.all(Array.from({ length: Math.min(4, batch.length) }, async () => {
    while (index < batch.length) {
      signal?.throwIfAborted()
      const row = batch[index++]
      if (row.running) { running++; continue }
      let handle
      try {
        handle = await persistence.open(row.sessionId, 'read')
        const { events } = await handle.read()
        signal?.throwIfAborted()
        const users = events.filter(event => event.type === 'user/message').map(event => textOf(event.data?.message || event.data)).join('\n')
        if (!/微缩|three\.?js|\b3d\b|三维|【场景主题】|【完整设计规格】|miniature-runs/i.test(users)) continue
        const session = await inspectSession({ id: row.sessionId, session: { header: handle.header, snapshotEvents: () => events } })
        if (!session.files.length) continue
        items.push({ sessionId: session.sessionId, title: session.title, cwd: handle.header.cwd,
          updatedAt: row.updatedAt || handle.header.createdAt || 0, file: session.files[0], fileCount: session.files.length })
      } catch (error) { signal?.throwIfAborted(); unreadable++ }
      finally { if (handle) await handle.close() }
    }
  }))
  items.sort((a, b) => b.updatedAt - a.updatedAt)
  const scanned = offset + batch.length
  return { items, scanned, total: rows.length, nextCursor: scanned < rows.length ? scanned : null, unreadable, running }
}

export function registerSessionLibrary(ctx) {
  ctx.connection.fetch.register({ path: ROUTE, methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    const respond = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
    try {
      if (!request.headers.get('content-type')?.startsWith('application/json')) return respond({ ok: false, error: 'expected application/json' }, 415)
      const body = await request.text()
      if (body.length > 12000) return respond({ ok: false, error: '请求过大' }, 413)
      const input = JSON.parse(body)
      if (input.action === 'discover') return respond({ ok: true, discovery: await discoverSessionScenes(ctx, { cursor: input.cursor, signal: request.signal }) })
      const sessionId = normalizeSessionId(input.sessionId)
      if (!ctx.sessionController?.agents?.resolveAgent) throw new Error('会话读取接口不可用，请完全退出并重新打开 DSH')
      const resolved = await ctx.sessionController.agents.resolveAgent(sessionId)
      if (resolved.error || !resolved.agent) throw new Error('未找到可读取的本地会话：' + sessionId)
      const session = await inspectSession(resolved.agent)
      if (input.action !== 'import') return respond({ ok: true, session })
      const file = session.files.find((f) => f.path === input.path)
      if (!file) throw new Error('请选择该会话实际生成的 HTML 文件；文件可能已移动或不存在')
      const html = await fs.readFile(file.path, 'utf8')
      const id = 'session-' + createHash('sha256').update(sessionId + '\n' + file.path).digest('hex').slice(0, 24)
      return respond({ ok: true, session: { ...session, html, id, sourcePath: file.path } })
    } catch (error) { return respond({ ok: false, error: error.message }, 400) }
  } })
}
