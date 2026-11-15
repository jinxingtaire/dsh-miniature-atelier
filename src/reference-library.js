export const templates = [
  {
    id: 'layered-courtyard', title: '方底座 · 前低后高', category: '构图', color: '#9a5146',
    summary: '用路径串起前、中、后景，绕到侧面也能读出结构。',
    example: '一座背靠断崖的纸灯驿院，雨后参道上还摆着晾干的灯架。',
    space: '用完整方底座。前景留出入口和一段能看清走向的路，中景安排转折与小道具，主建筑放在后部偏中。侧面也要有真实支撑和可读的切面。',
    visual: '主建筑轮廓先于装饰。选两种主材和一种点缀材质，接触阴影让台阶、廊檐和底座分开。',
    motion: '只让一两处近景细节循环，例如檐下轻摆或几片落叶。建筑保持静止。',
    controls: '初始镜头从入口斜前方俯视。环绕到背面时，主次与底座边界依然清楚。',
    acceptance: '首屏能一眼指出入口、路线和主建筑。侧视下，桥、檐和台阶没有悬空或穿插。',
  },
  {
    id: 'canopy-route', title: '多高程 · 连桥路线', category: '空间', color: '#3e755e',
    summary: '把平台放在不同高度，用看得懂的桥、梯和支点连起来。',
    example: '云雾里的树冠邮站，两座小平台靠一条吊桥连通。',
    space: '在同一底座上设两个以上有明确支撑的平台。用一条连桥或阶梯贯穿高低差，桥有固定点，平台之间留出能看穿的空隙。',
    visual: '用轮廓区分支撑物、平台和通行线。树叶或云雾只围住边缘，给主连接点留出窗口。',
    motion: '让桥索或树冠轻微摆动，连接点保持固定。把循环幅度限制在不影响路径可读性的范围。',
    controls: '默认从斜上方看清路线。允许降低视角查看桥下与支撑，避免镜头穿进平台。',
    acceptance: '至少两个视角能看清路线连到哪里，桥两端都有锚点，最高点和支撑落点都可见。',
  },
  {
    id: 'storm-signal', title: '风暴 · 信号与响应', category: '动效', color: '#486582',
    summary: '用同一个天气事件驱动雨、水、雾和灯，把动作集中在一个焦点。',
    example: '暴雨中的潮汐信号塔，转灯扫过礁石时能看见一圈白浪。',
    space: '把主信号设备与受它照亮或影响的地表放在同一个视野。留出光束、飞沫和风的运动空间。',
    visual: '设置可辨认的稳定底光。把信号光和天气高光限制在局部，保留主体边缘。',
    motion: '设计稳定的环境循环与一次短促的事件。让同一事件改变雨幕亮度、水面和物体受光，恢复后回到原循环。',
    controls: '保留标准环绕和缩放。为事件增加一次明确的可选触发，桌面用键盘，触屏可点选场景内对应装置。',
    acceptance: '事件发生前、发生时和恢复后均能认出主体。重复触发后没有叠加风暴、相机跳变或粒子数量持续增加。',
  },
  {
    id: 'day-night-diorama', title: '昼夜 · 环境状态', category: '氛围', color: '#62639b',
    summary: '用时间状态组织光照、粒子和反射，让同一场景有两种读法。',
    example: '冬至后的山坡小村，冰池边的灯会在暮色里依次亮起。',
    space: '布置一处地表焦点和两三处能读出尺度的小景。需要剖面时，把表层与内部层理做成真实几何。',
    visual: '分别定义日间和夜间的环境色、阴影和发光点。雪、冰、水面或草地选一种重点材质，表现光线变化。',
    motion: '用同一时间状态驱动环境光、点灯和粒子。重复的雪点、植被或萤火做批处理，粒子回收复用。',
    controls: '始终可拖转缩放。只有主题需要切换时间时才增加操作，并让触屏有等效入口。',
    acceptance: '时间变化后主体结构仍清楚，光与粒子响应同步，多次循环后性能稳定。',
  },
  {
    id: 'pixel-district', title: '像素 · 双渲染模式', category: '渲染', color: '#775395',
    summary: '先建真实三维体块，再把低分辨率渲染作为一层可切换效果。',
    example: '雨夜漂浮在旧港上的体素夜市，霓虹只照亮三条短巷。',
    space: '把场景收在一座有清晰顶面与侧面的紧凑底座。用几条短路径组织不同高度的摊位或建筑。',
    visual: '用简明体块和有限配色。像素模式先渲染到低分辨率目标，再用最近邻放大。清晰模式沿用同一套几何和材质。',
    motion: '将雨丝、灯光或移动道具做成少量独立循环。重复物体优先实例化，切换模式时复用场景和资源。',
    controls: '拖转与缩放保留。另提供像素切换和复位动作，切模式时保留相机、时间和当前交互状态。',
    acceptance: '清晰与像素两种模式都能读出地形、路径和主建筑，横竖屏切换后画面比例和控件正常。',
  },
  {
    id: 'transparent-container', title: '透明容器 · 内外两层', category: '材质与物理', color: '#3d7d80',
    summary: '让玻璃、内容物和托座各有边界，环绕时能看清里面。',
    example: '玻璃罐里封存着一座会下雪的山间索道站，搁在旧木托上。',
    frame: '完整拍到透明容器的外轮廓、最高点和承重托座；内部内容在任意视角下都受容器边界约束。',
    space: '分成外部陈设、容器外壳和内部世界三层。内部用独立坐标边界约束几何与粒子，外壳有清楚的受力点。',
    visual: '玻璃的边缘反光说明外壳形状，中心区域留足透明度。用遮挡关系、色深和微小高光区分内外。',
    motion: '让内部水面、雪或气泡有可解释的循环。若有摇晃交互，范围只限容器及内部响应，托座与相机保持稳定。',
    controls: '保持完整环绕和缩放。可选一次直接操纵容器的动作，结束后平稳回到静置状态。',
    acceptance: '正面、侧面和低角度都能辨认容器和内部主体；任何动效与道具都不会穿出玻璃。',
  },
  {
    id: 'street-interior', title: '街角 · 内外空间连续', category: '观察', color: '#966346',
    summary: '从不同窗面看到同一个真实室内，让雨后反射随视角变化。',
    example: '雨后街角的旧唱片店，橱窗透出暖光，绕到侧窗能看见同一台唱机。',
    space: '搭出街角转折、入口与至少两个观察方向。橱窗、侧窗和室内共用一套真实布局，街边家具与门窗比例统一。',
    visual: '用室内局部暖光对比室外环境色。若地面潮湿，反光服从视角和材质变化，避免把道路做成整面镜子。',
    motion: '用窗内和街边各一处轻微动态交代空间仍在使用。天气、声音或其他事件只在主题明确要求时加入。',
    controls: '默认斜前方看全街角，手动环绕能看进侧窗。提供双击复位和触屏操作。',
    acceptance: '街角首屏可辨；绕至侧窗能看到同一套室内陈设，反光随相机变化而变化。',
  },
]

export const cases = [
  {
    id: 'ref-hakurei-shrine', title: '博丽神社微缩', author: 'sallyn', date: '2026-09-12',
    url: 'https://linux.do/t/topic/2892710', demoUrl: 'https://deepdemos.top/demo/dsv4-1-harness-2eb6ccf4',
    evidence: '原帖含完整提示词 · 有对照演示', templateId: 'layered-courtyard',
    learn: '先用参道留出前景，再用台阶抬高后部主建筑，让一块方底座也有清楚的进入路线。',
  },
  {
    id: 'ref-canopy-station', title: '丛林树冠科研站', author: 'ItsmeAjayKV', date: '2026-11-07',
    url: 'https://x.com/ItsmeAjayKV/status/2118858469529063472',
    evidence: '原帖演示 · HTML 和操作未验证', templateId: 'canopy-route',
    learn: '把巨树当作承重结构，利用分层平台和绳桥，把体块之间的空隙变成一条可读的路线。',
  },
  {
    id: 'ref-storm-lighthouse', title: '风暴灯塔', author: 'TokenGremlin', date: '2026-10-18',
    url: 'https://x.com/TokenGremlin/status/2111581758575550546',
    evidence: '原帖演示 · 作者采用自动镜头', templateId: 'storm-signal',
    learn: '用扫过雾层的灯束作为稳定的视觉锚点，浪花、雨和闪电围绕它形成不同节奏。',
  },
  {
    id: 'ref-floating-playground', title: '浮空岛体素游乐场', author: 'cfenghub', date: '2026-10-28',
    url: 'https://x.com/cfenghub/status/2115336591245987956',
    evidence: '原帖有实现要点 · Three.js 走 CDN', templateId: 'pixel-district',
    learn: '体素负责几何，低分辨率目标和最近邻放大负责像素观感。两层分开，切换时可以复用整个场景。',
  },
  {
    id: 'ref-rain-city', title: '雨町浮空城', author: 'KajianD65580', date: '2026-10-29',
    url: 'https://x.com/KajianD65580/status/2115637869645807636',
    evidence: '原帖含参考提示词与按键说明', templateId: 'pixel-district',
    learn: '把闪电和像素模式做成独立开关，观众可以主动对比效果，同时继续拖转看场景。',
  },
  {
    id: 'ref-alpine-village', title: '圣诞夜阿尔卑斯小村', author: 'ivanfioravanti', date: '2026-11-03',
    url: 'https://x.com/ivanfioravanti/status/2117322189989134567',
    promptUrl: 'https://x.com/ivanfioravanti/status/2117322192597696575',
    evidence: '对比演示 · 有完整提示词', templateId: 'day-night-diorama',
    learn: '给积雪、薄冰和窗灯各自写清楚受光条件，再用切面说明地表之下还有什么。',
  },
  {
    id: 'ref-moonlit-pond', title: '月光荷塘', author: 'ItsmeAjayKV', date: '2026-10-26',
    url: 'https://x.com/ItsmeAjayKV/status/2114747285557109052',
    evidence: '原帖演示 · HTML 和操作未验证', templateId: 'day-night-diorama',
    learn: '用水下、水面、空中三层安置生物和微动效。这个原例用的是固定月夜，可以只借分层手法。',
  },
  {
    id: 'ref-bottled-ocean', title: '瓶中沧海', author: 'k452b', date: '2026-09-08',
    url: 'https://linux.do/t/topic/2875086', demoUrl: 'https://ocean-in-a-bottle.vercel.app/',
    evidence: 'Qwen 原帖含完整提示词 · 有演示页', templateId: 'transparent-container',
    learn: '把瓶身、托架和瓶中世界当作三个层次，分别处理玻璃反光、内部边界和水面响应。',
  },
  {
    id: 'ref-snow-globe', title: '雪地球仪冬日小村', author: 'MrTacticalX', date: '2026-10-27',
    url: 'https://x.com/MrTacticalX/status/2114814418521346273',
    evidence: '对比演示 · 正文有一句话提示词', templateId: 'transparent-container',
    learn: '把摇晃写成会改变内部雪粒状态的操作，给它明确的沉降过程，透明外壳始终可辨。',
  },
  {
    id: 'ref-paris-cafe', title: '巴黎街角咖啡馆', author: 'likka_ailive', date: '2026-11-09',
    url: 'https://x.com/likka_ailive/status/2119765983137243177',
    promptUrl: 'https://x.com/likka_ailive/status/2119766148980121838',
    evidence: '有完整提示词 · 原要求使用固定版本 CDN', templateId: 'street-interior',
    learn: '把首屏、橱窗和侧窗分别写进提示词，再要求侧窗里仍是同一个室内，检查空间连贯性。',
  },
]

const originalPosters = {
  'ref-hakurei-shrine': 'https://cdn3.ldstatic.com/original/4X/7/1/3/7135de1ce4f04a6153e532dd9ab224b5008e76b3.jpeg',
  'ref-canopy-station': 'https://pbs.twimg.com/amplify_video_thumb/2118822528907161600/img/yRwGi7lZVimfD3y6.jpg?name=small',
  'ref-rain-city': 'https://pbs.twimg.com/amplify_video_thumb/2115637592612118528/img/MTA7mrQsopoUVOWz.jpg?name=small',
  'ref-moonlit-pond': 'https://pbs.twimg.com/amplify_video_thumb/2114746607921164288/img/8JGGS_OkhhTg83Ml.jpg?name=small',
  'ref-bottled-ocean': 'https://cdn3.ldstatic.com/original/4X/d/6/4/d64cf06ab179796732a03f9cc088f969ef918fa8.png',
  'ref-snow-globe': 'https://pbs.twimg.com/amplify_video_thumb/2114814008133894144/img/A4zOs8X4RU19fm6V.jpg?name=small',
  'ref-paris-cafe': 'https://pbs.twimg.com/amplify_video_thumb/2119765932218466304/img/KdVjdyw8fhV3Sv2I.jpg?name=small',
}

const topicsByTemplate = {
  'layered-courtyard': '建筑与街区', 'canopy-route': '浮岛与高差', 'storm-signal': '天气与光',
  'pixel-district': '体素与像素', 'day-night-diorama': '水体与生态',
  'transparent-container': '容器与玻璃', 'street-interior': '室内与剖面',
}

export function assembleReferenceCases(records) {
  const postId = (url) => /\/status\/(\d+)$/.exec(url)?.[1]
  const sourceByPost = new Map(records.map((record) => [postId(record.url), record]))
  const merged = cases.map((scene) => {
    const record = sourceByPost.get(postId(scene.url))
    if (record) sourceByPost.delete(postId(scene.url))
    return {
      ...record,
      ...scene,
      topic: topicsByTemplate[scene.templateId],
      scope: 'scene',
      coverUrl: originalPosters[scene.id] || record?.coverUrl,
      demoIsCollection: Boolean(record && !scene.demoUrl),
      hasPrompt: Boolean(scene.promptUrl || /提示词/.test(scene.evidence) || record?.promptUrl),
    }
  })
  return [...merged, ...Array.from(sourceByPost.values(), (record) => ({
    ...record,
    demoIsCollection: true,
    hasPrompt: Boolean(record.promptUrl),
    evidence: record.comparison ? '合集 · 模型对比' : '合集 · 作品演示',
  }))]
}
