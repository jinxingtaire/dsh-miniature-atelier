/** DSH Miniature Atelier's authenticated scene design route. */
import { fileURLToPath } from 'node:url'
import { templates } from './reference-library.js'
import { registerFullSceneRoutes } from './full-scene.js'
import { registerSessionLibrary } from './session-library.js'
import { registerCasePrompts } from './case-prompts.js'
import { registerReferenceImages } from './reference-images.js'
import { MODELING_PARAMETER_PATH, MODELING_PARAMETER_SYSTEM, modelingParameterInstruction, normalizeModelingParameters } from './modeling-parameters.js'
import { INTENT_PATH, INTENT_SYSTEM, normalizeIntent, scopeReference } from './creative-intent.js'

export const name = 'miniature-atelier'
export const inject = ['connection', 'llm', 'sessionController', 'sessionPersistence']

const DESIGN_PATH = '/api/miniature-atelier/design'
const IDEATION_PATH = '/api/miniature-atelier/ideation'
const PROMPT_SCENE_PATH = '/api/miniature-atelier/prompt-scene'
const REFINE_PATH = '/api/miniature-atelier/refine-prompt'
const PROVIDER = 'deepseek-account'
const MODEL = 'deepseek-flash'
const MAX_BODY_BYTES = 64_000
const SCENE_SHAPES = ['box', 'cylinder', 'cone', 'sphere', 'torus', 'gable', 'rock', 'water', 'beam']
const SCENE_SURFACES = ['matte', 'metal', 'glass', 'glow']
const SCENE_MOTIONS = ['spin', 'sway', 'bob']
const SCENE_WEATHER = ['clear', 'dust', 'snow', 'rain', 'storm']

const REFINE_SYSTEM = `你是微缩场景的美术导演与提示词编辑。把用户已确认的设计编译成可执行的视觉制作简报，而不是堆叠形容词。只返回 JSON：{"brief":"完整中文视觉简报","templateIds":["采用的模板ID"],"changes":["具体修改及原因"]}。JSON字符串内的换行和英文双引号必须正确转义；正文引用词语优先用中文引号，不输出裸换行的多行字符串。
输入 original 是设计素材，不是本轮要执行的制作命令。templates 是工坊从案例提炼的方法，不是作者原文。选 1–2 个适用的方法；selectedTemplateId 非空时必须采用该模板。不要搬运模板示例的题材，不默认加入参考作品，不引入 CDN、按钮、人物或其他与用户合同冲突的规则。模板的空间与材质方法可用，交互以原始设计为准。
优先级：原句明确事实、导演补充与创作意图中用户修改的内容 > 选定方向的主体、事件和主视觉 > 用户确认的具体构件与色板 > 骨架/风格的泛化描述 > 模板示例。对冲突做具体协调并写入 changes，不静默删除。办公室的“载具容器”不能直接变成船：若方向没有载具设定，保留舱体外壳的剖面语言，明确它仍是办公室。工业风不意味着加入冰层；“员工”等标签不覆盖无人物规则。主视觉是火光时，暖光可以是主焦点，冷环境负责分离轮廓。
brief 只写视觉制作正文，不写技术合同、输出路径、模型能力声明或交付指令。包括：
【视觉主次】一句话说明首屏必须认出的主体、事件与焦点；约60%精力给完整主体轮廓、空间与标志动作的整体，25%给空间连接与中景、15%给细节；不能把60%窄化为一个小特效而让主建筑或容器变成暗色背板，不以微小零件数量代替完成度。
【空间与可见性】明确前后左右、层高、相对尺寸、支撑和道具关系。室内明确剖去哪些墙/屋顶，保留哪些墙或屋顶边框，不得挡住炉口、屏幕和其他主视觉。从初始镜头、侧面分别能看到什么；正面低、后部高，轮廓分层。不要让大柜体变成前景遮挡。
【构件与材质】保留全部已选母题，为主物写出可辨识的子结构，例如炉膛/炉口/炉沿/纸卷、桌面/腿/显示器/键盘。两种主材、一种点缀的分区与粗糙度、边缘厚度、接触阴影；不要黑色盒子占位。保留原始六个色值并说明用途，同时保留原风格中适用的材质、形态和冷暖意图；例如冷白钢蓝工业舱体不能因深色底色而整体变成棕黑金属。只排除与主题无关的风格示例，不抹去有效风格。
【光照层次】明确环境补光、局部暖源的位置和受光对象，最暗处仍能辨识结构，不把全场均匀染橙。
【动作因果】每个动作写清来源、路径、受影响物、终点、回收和循环；例如纸灰从炉口螺旋上升、撞近顶面碎散，火光影响邻近物。动态冻结时也能认出主题。
【逐视角验收】分别写1600×1000、500×800首屏、侧面与暗部的可观察验收项。若只剩方块、关键事件不可见、顶/墙挡住内部，判定未完成并要求重做。不得声称已经运行或验收。
保留原始名称、主题、色板、密度、构图、展示节奏与禁用项。不要降低要求去适配插件快速渲染器，完整制作由Agent执行。中文自然简洁，正文约1200–2200字，changes 2–6条。`

function normalizeRefinement(value, selectedTemplateId) {
  const brief = typeof value?.brief === 'string' ? value.brief.trim() : ''
  const sections = ['【视觉主次】', '【空间与可见性】', '【构件与材质】', '【光照层次】', '【动作因果】', '【逐视角验收】']
  const ids = Array.isArray(value?.templateIds) ? [...new Set(value.templateIds)] : []
  if (brief.length < 300 || brief.length > 16000 || !sections.every((section) => brief.includes(section))
    || ids.length < 1 || ids.length > 2 || ids.some((id) => !templates.some((item) => item.id === id))
    || (selectedTemplateId && !ids.includes(selectedTemplateId))) throw new Error('提示词优化不完整，请重试')
  const changes = Array.isArray(value?.changes) ? value.changes.filter((line) => typeof line === 'string' && line.trim()).slice(0, 6).map((line) => line.trim().slice(0, 400)) : []
  if (!changes.length) throw new Error('提示词优化缺少修改说明，请重试')
  return { brief, templateIds: ids, changes }
}

const PROMPT_SCENE_SYSTEM = `你是微缩场景建模师。用户消息是完整的场景提示词。按主题、个性化要求、构图、材质、光色和动效搭建实际场景。用户对主题和个性化的编辑优先于模板示例。作品由本地 Three.js 渲染，所以只返回一个 JSON 对象。不要返回 HTML、脚本、Markdown 或解释。用户要求的单文件 HTML、交互和离线打包由运行时负责。
格式示例（尺寸和位置须根据用户描述重新设计）：
{"title":"中文作品名","summary":"一句话概括实际建模内容","palette":["#161b25","#42634b","#943b2d","#423530","#edac56","#b7ced4"],"ground":"#526648","base":"square","weather":"clear","parts":[{"shape":"box","size":[2,0.15,1],"at":[[0,0.075,0]],"color":"#a17c50"}]}
底座表面 y=0，方形 8.6×8.6 或直径 8.6 的 round；模型轴 y 向上，+z 为正面。size 是 [宽,高,深]，at 是中心坐标数组，同类重复构件可共用一个 at 数组（最多 12 个位置）。shape 可选 ${SCENE_SHAPES.join('、')}；gable 是屋脊沿 x 的三角屋顶，torus 默认在 XY 平面。可选 rot 为 [绕x,绕y,绕z] 弧度，surface 为 ${SCENE_SURFACES.join('、')}，motion 为 ${SCENE_MOTIONS.join('、')}。weather 可选 ${SCENE_WEATHER.join('、')}。
water 是连续起伏并带浪尖白沫的水面，size 为 [水面宽,波幅,水面深]，波幅选 0.05 至 0.22，at 的 y 是水面高度。海洋、湖泊与潮池用真实 water 构件，并把礁石等放在水面上方，水面下的地面颜色要协调。beam 是半透明光束，at 是光源，默认从光源向 +x 展开，size 为 [长度,末端高度,末端宽度]，可通过 rot 瞄准方向，motion=spin 会绕光源水平扫光。只在主题需要光束时使用，光源旁补一个小型 glow 构件。暴雨闪电用 weather=storm，持续降雨无闪电用 rain。用这些实际几何和环境参数实现动效，别把效果写成静态方块或文字道具。
rain/storm 天气引擎已提供真实降雨与全局雾，storm 还会闪电照亮场景。不要再用杆、方块或锥体模拟静态雨丝与闪电，也不要用透明球体充当雾团。beam 仅放在真实发光设备的光源处。浪尖白沫由 water 自动产生，礁石附近可以补少量贴水面的泡沫。
这次方案由用户的一句话和已确认的创作选择决定。用户指定的主物必须直接建模，不套用其他题材的主体。若给了主体造型、色板和细节层次，优先保持它们，忽略面向文件工具的执行指令。
用 14 至 44 组构件，先构建可辨识的主体轮廓与真实连接关系，再建入口、路径、前中后景和少量标志性细节。屋顶、檐口和柱子要实际接合，重复件用同组位置，避免穿插和悬空。让主体与地景充满底座，但别越过边缘；最高点在 y=6.2 以内。palette 恰好六个颜色，顺序为背景、主色、金属、底座暗色、暖光、冷光。所有颜色用六位 HEX 字符串。只在用户要求的位置加少量可循环的 motion，透明外壳用 glass。不要用说明文字代替几何。提交完整、可解析的 JSON。`

function normalizePromptScene(scene) {
  const isColor = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
  const vector = (value, min, max) => Array.isArray(value) && value.length === 3
    && value.every((n) => Number.isFinite(n) && n >= min && n <= max)
  const title = typeof scene?.title === 'string' ? scene.title.trim().slice(0, 60) : ''
  if (!title || !Array.isArray(scene.palette) || scene.palette.length !== 6 || !scene.palette.every(isColor)
    || !Array.isArray(scene.parts) || scene.parts.length > 64) throw new Error('DeepSeek 返回的场景缺少有效标题、色板或构件')

  const parts = scene.parts.flatMap((part) => {
    if (!SCENE_SHAPES.includes(part?.shape) || !isColor(part.color)
      || !vector(part.size, 0.01, 30) || !Array.isArray(part.at)) return []
    const at = part.at.slice(0, 12).filter((pos) =>
      vector(pos, -30, 30) && pos[1] >= 0)
    if (!at.length) return []
    return [{
      shape: part.shape, size: part.size, at, color: part.color,
      surface: SCENE_SURFACES.includes(part.surface) ? part.surface : 'matte',
      ...(vector(part.rot, -6.29, 6.29) ? { rot: part.rot } : {}),
      ...(SCENE_MOTIONS.includes(part.motion) ? { motion: part.motion } : {}),
    }]
  })
  if (parts.length < 4) throw new Error('DeepSeek 返回的有效场景构件不足')
  // Fit the whole arrangement together so an oversized plan retains its upper structures.
  let scale = 1
  for (const part of parts) {
    if (part.shape === 'beam') continue
    for (const pos of part.at) {
      scale = Math.min(scale,
        4.3 / (Math.abs(pos[0]) + part.size[0] / 2),
        6.2 / (pos[1] + part.size[1] / 2),
        4.3 / (Math.abs(pos[2]) + part.size[2] / 2))
    }
  }
  if (scale < 1) {
    for (const part of parts) {
      part.size = part.size.map((value) => value * scale)
      part.at = part.at.map((pos) => pos.map((value) => value * scale))
    }
  }
  return {
    title, parts, palette: scene.palette,
    summary: typeof scene.summary === 'string' ? scene.summary.trim().slice(0, 240) : '',
    ground: isColor(scene.ground) ? scene.ground : scene.palette[1],
    base: scene.base === 'round' ? 'round' : 'square',
    weather: SCENE_WEATHER.includes(scene.weather) ? scene.weather : 'clear',
  }
}

const IDEATION_PROMPT = `你负责把用户的一句话扩写成三套彼此不同、可摆在方形底座上的三维微缩场景。seed 是本轮创作素材，previous 是本轮排除清单。
这件作品将在浏览器里由 Three.js 生成。细节要写成可见的程序化几何、材质与连续动画，避免以棉絮、丝线、树脂浇注或安装 LED 等实体工艺代替实际动效。
1. 提取原句里的主体、环境、动作和反常细节。每案保留用户明确写出的事实，解释其中一个悬念，给出可直接看见的线索。原句没给的设定可以想象，但不能冒充用户的原意。
2. 三案必须在场景的用途、故事因果或空间关系上有实质差异。不能只换名字、颜色或滤镜。别复述原句来填段落。
换一批时，先识别 previous 中每条提案的主要用途、关键事件的原因、最醒目的可见证据，把这些当作本轮的排除条件。每个新提案必须用新的原因解释原句的关键细节，且要有不同的用途或空间机制。改部件、位置、材质或名字仍然属于重复。提交前逐一检查新标题和核心创意，碰到旧设定就换掉该提案。
3. 每案都要给出与自身设定对应的骨架、地形、材质风格、光源、六色色板和具体构件。优先让关键细节说话。主体轮廓清楚，可在一个方形底座上搭建。archetype 按主体轮廓选，不按故事功能选。archetype、terrain、style、light 的 id 只能从对应 renderOptions 里选，label 和 line 要为当前提案重新写。色板按背景、主色、金属、深色、暖光、冷光排列。
4. intent 是对用户创作意图的提炼，包含可编辑的目标、必须保留、借鉴点与排除项。用户修改后的内容按用户要求处理；不确定项是推测，不能变成硬要求。三案都遵循明确要求，并在故事与空间上拉开差异。
5. 每案style.line只能写画风与美术表现，不出现具体物体、建筑、地形、天气、剧情或建模清单。preferredStyle 是用户主动选用的美术风格，三案都必须遵循它的形体、材质与光照语言；故事与空间仍各不相同。referenceImages 是经过实际读图提取的观察结果，按 referenceUses 指定用途借鉴；auto用途由intent.references决定。只有subject用途才保留图中主体，其他用途不得照搬题材；始终忽略品牌和界面。referenceImages 与 preferredStyle 不同时，明确选定风格优先，图片只贡献指定维度。templateRules 是用户主动选用的方法，referenceIdeas 是可借鉴的手法。将它们应用到 seed 的主题。容器等超出快速预览能力的细节可以写成深度制作意图，仍然为预览选择可用的渲染类型。
只返回合法 JSON 对象，不要 Markdown。directions 恰好 3 项。kicker 是 4 至 10 个字的短语，具体设定写在 line 里。用自然的中文描述。每案给 4 至 5 件细节，包含至少一个 main，其余放 mid 或 atmosphere。
{"signals":["原句锚点"],"directions":[{"title":"作品名","kicker":"叙事切口","line":"写清这座场景里发生了什么和能看到什么","atmosphere":"一句话气质","tags":["场景标签"],"archetype":{"id":"渲染类型 ID","label":"骨架名称","line":"具体轮廓和布局"},"terrain":{"id":"地形 ID","label":"地形名称","line":"底座上的地貌"},"style":{"id":"风格 ID","label":"气质名称","line":"具体材质和处理"},"light":{"id":"光线 ID","label":"光线名称","line":"光从哪里来，照到哪里"},"palette":{"label":"色板名称","line":"这组颜色的用途","colors":["#000000","#000000","#000000","#000000","#000000","#000000"]},"details":[{"layer":"main|mid|atmosphere","label":"具体物件或效果","line":"它在哪里，怎样建模或表现"}]}]}`

function systemPrompt() {
  return `你是一名微缩场景美术指导。根据用户的一句话与选择，设计一个可收藏的 3D 微缩场景。
只返回一个 JSON 对象，不要 Markdown、解释或代码。格式：
{
 "title": "不超过12个汉字的新标题",
 "structure": "shell|tower|workshop|observatory|station|sanctuary|garden|ruin 之一",
 "palette": ["#hex", "#hex", "#hex", "#hex", "#hex", "#hex"],
 "mood": "一句话气质",
 "parts": [
   {"type":"box|cylinder|cone|sphere|torus", "pos":[x,y,z], "size":[w,h,d], "color":0-5, "emissive":false, "rot":[x,y,z] (可选)}
 ],
 "props": ["最多5个物件名"],
 "lightWarm": 0.6-1.8,
 "fog": 0.012-0.045,
 "camera": {"theta": -1.2-1.2, "phi": 0.75-1.3, "radius": 15-26}
}
parts 最多 6 个，优先表现用户确认的细节，只做小构件，单个尺寸不超过 0.9；圆形构件用 size 的第一项表示半径、第二项表示高度。坐标在方形底座范围内（x/z -4..4，y 1..6），不要覆盖主体，不要添加中心大球体，不要让物体悬空。`
}

function userPrompt(payload, template) {
  return `一句话：${payload.seed || ''}
方向：${payload.direction || ''}
标题：${payload.title || ''}
原型：${payload.archetype || ''}
风格：${payload.style || ''}
地形：${payload.terrain || ''}
色板：${(payload.colors || []).join(' ')}
母题：${(payload.motifs || []).join('、')}`
    + (payload.artDirection ? `\n已确认的设计与细节（保持结构、色板与光线意图）：\n${JSON.stringify(payload.artDirection)}` : '')
    + (template ? `\n用户选用的方法：${template.title}。${template.space} ${template.visual}。快速生成只返回与现有渲染兼容的参数和小构件。` : '')
}

async function askDeepSeek(ctx, system, prompt, maxTokens, signal, temperature) {
  let text = ''
  let finished = false
  const stream = ctx.llm.stream({
    provider: PROVIDER,
    model: MODEL,
    reasoningEffort: 'off',
    temperature,
    maxTokens,
    signal,
    messages: [
      { role: 'system', content: [{ type: 'text', text: system }] },
      { role: 'user', content: [{ type: 'text', text: prompt }] },
    ],
  })
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== 'object') continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
    if (chunk.type === 'finish') {
      finished = true
      const reason = chunk.reason || chunk.finish
      if (reason?.kind === 'max-tokens') {
        throw new Error('DeepSeek reached the output limit before completing the scene design')
      }
      if (reason && (reason.kind === 'error' || reason.kind === 'aborted')) {
        const failure = reason.failure || {}
        throw new Error(failure.message || failure.code || 'DeepSeek request failed')
      }
    }
  }
  if (!finished) throw new Error('DeepSeek stream ended without a finish chunk')
  if (!text.trim()) throw new Error('DeepSeek returned an empty completion')
  try {
    return JSON.parse(text)
  } catch {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim())
  }
}

function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } })
}

export function apply(ctx) {
  const referenceImages = registerReferenceImages(ctx)
  registerFullSceneRoutes(ctx, { allowNewJobs: false })
  registerSessionLibrary(ctx)
  registerCasePrompts(ctx)
  ctx.connection.fetch.register({
    path: DESIGN_PATH,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch(request) {
      if (request.method === 'GET') {
        return json({ ok: true, service: 'miniature-atelier-deepseek', provider: PROVIDER, model: MODEL,
          enginePath: fileURLToPath(new URL('./three.min.js', import.meta.url)) })
      }
      return generate(ctx, request, 'design')
    },
  })
  ctx.connection.fetch.register({
    path: INTENT_PATH, methods: ['POST'], requestBody: 'buffered',
    fetch: request => generate(ctx, request, 'intent', referenceImages),
  })
  ctx.connection.fetch.register({
    path: MODELING_PARAMETER_PATH, methods: ['POST'], requestBody: 'buffered',
    fetch: request => generate(ctx, request, 'modeling', referenceImages),
  })
  ctx.connection.fetch.register({
    path: IDEATION_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => generate(ctx, request, 'ideation', referenceImages),
  })
  ctx.connection.fetch.register({
    path: PROMPT_SCENE_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: (request) => generate(ctx, request, 'promptScene'),
  })
  ctx.connection.fetch.register({
    path: REFINE_PATH, methods: ['POST'], requestBody: 'buffered',
    fetch: (request) => generate(ctx, request, 'refinement'),
  })
}

async function generate(ctx, request, mode, referenceImages) {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase()
  if (contentType !== 'application/json') return json({ ok: false, error: 'expected application/json' }, 415)
  const body = await request.arrayBuffer()
  if (body.byteLength > MAX_BODY_BYTES) return json({ ok: false, error: 'request body too large' }, 413)
  let payload
  try {
    payload = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return json({ ok: false, error: 'invalid JSON body' }, 400)
  }
  const ideation = mode === 'ideation'
  if ((ideation || mode === 'intent') && (typeof payload?.seed !== 'string' || payload.seed.trim().length < 2 || payload.seed.length > (ideation ? 180 : 1400))) {
    return json({ ok: false, error: ideation ? '请填写 2–180 字的场景描述' : '请填写 2–1400 字的创作描述' }, 400)
  }
  if (mode === 'modeling' && (!modelingParameterInstruction(payload?.mode) || typeof payload.subject !== 'string'
    || payload.subject.trim().length < 4 || payload.subject.length > 1400)) {
    return json({ ok: false, error: '请填写有效的建模描述' }, 400)
  }
  if (mode === 'promptScene' && (typeof payload?.prompt !== 'string' || !payload.prompt.trim())) {
    return json({ ok: false, error: '请先填写完整提示词' }, 400)
  }
  if (mode === 'refinement' && (typeof payload?.original !== 'string' || !payload.original.trim()
    || payload.original.length > 24000 || (payload.templateId && !templates.some((item) => item.id === payload.templateId)))) {
    return json({ ok: false, error: '请提供有效的设计与模板' }, 400)
  }
  try {
    const needsReferences = ideation || mode === 'intent' || mode === 'modeling'
    if (needsReferences) delete payload.referenceImages
    if (needsReferences && payload.referenceImageIds) {
      if (!Array.isArray(payload.referenceImageIds) || payload.referenceImageIds.length > 3 || payload.referenceImageIds.some(id => typeof id !== 'string')) throw new Error('参考图最多三张')
      const refs = await Promise.all(payload.referenceImageIds.map(id => referenceImages.load(id)))
      if (refs.some(ref => ref.status !== 'ready')) throw new Error('请先完成参考图解读，再开始构思')
      payload.referenceImages = refs.map(ref => ideation || mode === 'modeling' ? scopeReference(ref, payload.referenceUses?.find(use => use.id === ref.id), payload.intent) : { id: ref.id, name: ref.name, analysis: ref.analysis })
    }
    if (mode === 'modeling') {
      const input = JSON.stringify({
        subject: payload.subject, mode: payload.mode,
        intent: payload.intent,
        referenceImages: payload.referenceImages || [],
      })
      const result = await askDeepSeek(ctx, MODELING_PARAMETER_SYSTEM + '\n本次类型：' + modelingParameterInstruction(payload.mode), input, 3200, request.signal, 0.2)
      return json({ ok: true, parameters: normalizeModelingParameters(payload.mode, result) })
    }
    if (mode === 'intent') {
      const result = await askDeepSeek(ctx, INTENT_SYSTEM, JSON.stringify({ seed: payload.seed,
        preferredStyle: payload.preferredStyle, userCorrections: payload.userCorrections, referenceImages: payload.referenceImages || [], referenceUses: payload.referenceUses || [] }), 2800, request.signal, 0.25)
      return json({ ok: true, intent: normalizeIntent(result, payload.referenceImages || [], payload.referenceUses || [], payload.userCorrections), provider: PROVIDER, model: MODEL })
    }
    if (mode === 'refinement') {
      const input = JSON.stringify({
        original: payload.original, selectedTemplateId: payload.templateId || '',
        templates: templates.map(({ id, title, space, visual, motion, acceptance }) => ({ id, title, space, visual, motion, acceptance })),
      })
      let result
      try { result = await askDeepSeek(ctx, REFINE_SYSTEM, input, 6500, request.signal, 0.5) }
      catch (error) {
        // Retry malformed model JSON once, without relaxing the brief validator.
        if (!(error instanceof SyntaxError) || request.signal.aborted) throw error
        result = await askDeepSeek(ctx, REFINE_SYSTEM + '\n上一轮响应不是合法JSON。重新根据原始设计生成，必须转义字符串中的换行和双引号；不要省略六段正文或修改设计规格。', input, 6500, request.signal, 0.2)
      }
      return json({ ok: true, refinement: normalizeRefinement(result, payload.templateId), provider: PROVIDER, model: MODEL })
    }
    if (mode === 'promptScene') {
      const result = await askDeepSeek(ctx, PROMPT_SCENE_SYSTEM, payload.prompt, 6500, request.signal, 0.65)
      return json({ ok: true, promptScene: normalizePromptScene(result), provider: PROVIDER, model: MODEL })
    }
    const template = templates.find((entry) => entry.id === payload?.templateId)
    const ideationPayload = template ? {
      ...payload,
      templateRules: { space: template.space, visual: template.visual, motion: template.motion, controls: template.controls },
    } : payload
    const result = await askDeepSeek(
      ctx, ideation ? IDEATION_PROMPT : systemPrompt(),
      ideation ? JSON.stringify(ideationPayload) : userPrompt(payload || {}, template),
      ideation ? 4200 : 1400, request.signal, ideation ? 1.0 : 0.8,
    )
    return json({ ok: true, [mode]: result, provider: PROVIDER, model: MODEL })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!request.signal.aborted) ctx.logger?.warn?.(`[miniature-atelier] DeepSeek ${mode} failed: ${message}`)
    return json({ ok: false, error: message }, 502)
  }
}
