(function () {
  var cfg = window.__MA_CONFIG__ || {};
  var promptScene = cfg.promptScene;
  var T = window.THREE;
  if (!T) return;
  var seed = 2166136261;
  var seedText = String(cfg.seed || cfg.title || 'miniature');
  for (var si = 0; si < seedText.length; si++) { seed ^= seedText.charCodeAt(si); seed = Math.imul(seed, 16777619); }
  function rand() { seed += 0x6D2B79F5; var t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function range(a, b) { return a + (b - a) * rand(); }
  function pick(list) { return list[Math.floor(rand() * list.length) % list.length]; }
  var colors = (cfg.colors && cfg.colors.length ? cfg.colors : ['#101d2a', '#416b65', '#a77b43', '#47372f', '#d0a45f', '#9fc3c5']);
  function col(index, fallback) { return new T.Color(colors[index] || fallback); }
  var BG = col(0, '#0d141c').clone().lerp(new T.Color('#05080d'), 0.42);
  var ACCENT = col(1, '#416b65');
  var METAL = col(2, '#a77b43');
  var DARK = col(3, '#47372f');
  var WARM = col(4, '#d0a45f');
  var COOL = col(5, '#9fc3c5');
  var terrain = String(cfg.terrain || 'desert');
  var archetype = String(cfg.archetype || 'vessel');
  var title = String(cfg.title || '');
  var direction = String(cfg.direction || '');
  var motifs = Array.isArray(cfg.motifs) ? cfg.motifs.join(' ') : String(cfg.motifs || '');
  var structureHints = cfg.artDirection ? '' : title + direction;
  var isShell = archetype === 'shell' || archetype === 'vessel' || /蜗|壳|鲸|船|载具/.test(structureHints);
  var isShrine = archetype === 'sanctuary' || archetype === 'ruin' || /寺|庙|教堂|圣所|庭/.test(structureHints);
  var isShop = archetype === 'workshop' || /工坊|工房|修理|机械/.test(structureHints);
  var isStation = archetype === 'station' || /驿|站|码头|井/.test(structureHints);
  var isGarden = archetype === 'garden' || /花园|庭院|园/.test(structureHints);
  var isObservatory = archetype === 'observatory' || /观测|天文|瞭望|灯塔/.test(structureHints);
  var showcase = cfg.showcase !== false;
  var isRain = promptScene ? ['rain', 'storm'].includes(promptScene.weather) : /雨/.test(terrain + title + direction + motifs);
  var isSnow = promptScene ? promptScene.weather === 'snow' : /雪|冰|极地/.test(terrain + title + direction);
  var isAsh = /灰|烬|废墟/.test(terrain + title + direction);

  var renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  if ('outputColorSpace' in renderer && T.SRGBColorSpace) renderer.outputColorSpace = T.SRGBColorSpace;
  if (T.ACESFilmicToneMapping) { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.32; }
  renderer.setClearColor(BG, 1);
  renderer.domElement.setAttribute('aria-label', '3D miniature scene');
  document.body.style.margin = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.background = '#' + BG.getHexString();
  document.body.appendChild(renderer.domElement);

  var scene = new T.Scene();
  scene.background = BG.clone();
  scene.fog = new T.FogExp2(BG, terrain === 'city' ? 0.021 : 0.026);
  try {
    var envCanvas = document.createElement('canvas'); envCanvas.width = 64; envCanvas.height = 128;
    var ectx = envCanvas.getContext('2d'); var eg = ectx.createLinearGradient(0, 0, 0, 128); eg.addColorStop(0, '#3e5b6b'); eg.addColorStop(0.48, '#1b2733'); eg.addColorStop(1, '#6c4c35'); ectx.fillStyle = eg; ectx.fillRect(0, 0, 64, 128);
    var envTex = new T.CanvasTexture(envCanvas); envTex.mapping = T.EquirectangularReflectionMapping; scene.environment = envTex; if ('environmentIntensity' in scene) scene.environmentIntensity = 0.65;
  } catch (envErr) {}
  var camera = new T.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 120);
  var world = new T.Group();
  scene.add(world);

  function material(color, metalness, roughness, emissive, emissiveIntensity) {
    var m = new T.MeshStandardMaterial({ color: color, metalness: metalness == null ? 0.3 : metalness, roughness: roughness == null ? 0.65 : roughness });
    if (emissive) { m.emissive = emissive; m.emissiveIntensity = emissiveIntensity == null ? 1.2 : emissiveIntensity; }
    return m;
  }
  var stoneMat = material(DARK.clone().lerp(new T.Color('#514237'), 0.42), 0.12, 0.88);
  var stoneLight = material(DARK.clone().lerp(new T.Color('#938478'), 0.5), 0.08, 0.82);
  var metalMat = material(METAL.clone().lerp(new T.Color('#d0a45f'), 0.18), 0.5, 0.38);
  var darkMetal = material(METAL.clone().multiplyScalar(0.5), 0.45, 0.46);
  var accentMat = material(ACCENT, 0.35, 0.52);
  var coolMat = material(COOL, 0.2, 0.6);
  var warmMat = material(WARM, 0.4, 0.45, WARM, 0.8);
  var glowMat = material(WARM, 0.1, 0.28, WARM, 2.6);
  var sandMat = material(new T.Color('#b38b5d'), 0.02, 0.95);
  var snowMat = material(new T.Color('#b7cdd5'), 0.02, 0.86);
  var wetMat = material(new T.Color('#131c24'), 0.55, 0.2);
  var foliageMat = material(new T.Color('#233f36'), 0.05, 0.95);

  function mesh(geo, mat, x, y, z, parent) {
    var m = new T.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || world).add(m);
    return m;
  }
  function box(w, h, d, mat, x, y, z, parent) { return mesh(new T.BoxGeometry(w, h, d), mat, x, y, z, parent); }
  function cyl(rt, rb, h, seg, mat, x, y, z, parent) { return mesh(new T.CylinderGeometry(rt, rb, h, seg || 10), mat, x, y, z, parent); }
  function sphere(r, seg, mat, x, y, z, parent) { return mesh(new T.SphereGeometry(r, seg || 16, Math.max(8, (seg || 16) / 2)), mat, x, y, z, parent); }
  function cone(r, h, seg, mat, x, y, z, parent) { return mesh(new T.ConeGeometry(r, h, seg || 8), mat, x, y, z, parent); }
  function ring(r, tube, mat, x, y, z, parent) { return mesh(new T.TorusGeometry(r, tube, 8, 28), mat, x, y, z, parent); }
  function setRot(m, x, y, z) { m.rotation.set(x || 0, y || 0, z || 0); return m; }
  function addGlowWindow(parent, x, y, z, w, h, rotY) {
    var g = new T.Group(); g.position.set(x, y, z); g.rotation.y = rotY || 0;
    box(w + 0.08, h + 0.08, 0.08, darkMetal, 0, 0, 0, g);
    box(w, h, 0.1, glowMat, 0, 0, 0.05, g);
    parent.add(g); return g;
  }

  // ---- plinth ----
  var plinth = new T.Group(); world.add(plinth);
  if (promptScene && promptScene.base === 'round') {
    cyl(4.75, 4.9, 0.18, 64, darkMetal, 0, 0.09, 0, plinth);
    cyl(4.55, 4.75, 0.7, 64, stoneMat, 0, 0.52, 0, plinth);
    cyl(4.5, 4.55, 0.22, 64, stoneLight, 0, 0.96, 0, plinth);
  } else {
    box(9.8, 0.18, 9.8, darkMetal, 0, 0.09, 0, plinth);
    box(9.4, 0.7, 9.4, stoneMat, 0, 0.52, 0, plinth);
    box(9.0, 0.22, 9.0, stoneLight, 0, 0.96, 0, plinth);
    for (var band = 0; band < 3; band++) {
      box(9.46, 0.035, 9.46, darkMetal, 0, 0.3 + band * 0.2, 0, plinth);
    }
    for (var corner = 0; corner < 4; corner++) {
      var cx = corner < 2 ? -4.55 : 4.55;
      var cz = corner % 2 === 0 ? -4.55 : 4.55;
      box(0.16, 0.82, 0.16, darkMetal, cx, 0.52, cz, plinth);
    }
    // side strata lines
    for (var sideLine = 0; sideLine < 5; sideLine++) {
      var ly = 0.2 + sideLine * 0.13;
      box(9.08, 0.012, 0.012, stoneLight, 0, ly, 4.71, plinth);
      box(0.012, 0.012, 9.08, stoneLight, 4.71, ly, 0, plinth);
    }
  }
  var topY = 1.08;

  // ---- terrain ----
  var terrainGroup = new T.Group(); world.add(terrainGroup);
  var groundMat = promptScene ? material(promptScene.ground, 0.04, 0.83) : terrain === 'snow' || terrain === 'ice' ? snowMat : (terrain === 'city' ? wetMat : (terrain === 'ash' ? stoneMat : sandMat));
  var ground = promptScene && promptScene.base === 'round'
    ? cyl(4.3, 4.3, 0.16, 64, groundMat, 0, topY, 0, terrainGroup)
    : box(8.6, 0.16, 8.6, groundMat, 0, topY, 0, terrainGroup);
  ground.castShadow = false;

  function dune(x, z, r, h) {
    var d = new T.Mesh(new T.SphereGeometry(r, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), sandMat);
    d.scale.y = h / r; d.position.set(x, topY + 0.03, z); d.castShadow = true; d.receiveShadow = true; terrainGroup.add(d); return d;
  }
  function rock(x, z, s, mat) {
    var r = new T.Mesh(new T.DodecahedronGeometry(s, 0), mat || stoneLight);
    r.position.set(x, topY + s * 0.5, z); r.rotation.set(rand(), rand() * 6, rand()); r.castShadow = true; r.receiveShadow = true; terrainGroup.add(r); return r;
  }
  function tree(x, z, scale) {
    var g = new T.Group(); g.position.set(x, topY, z);
    cyl(0.06 * scale, 0.1 * scale, 1.3 * scale, 7, darkMetal, 0, 0.65 * scale, 0, g);
    cone(0.7 * scale, 1.1 * scale, 7, foliageMat, 0, 1.45 * scale, 0, g);
    cone(0.5 * scale, 0.8 * scale, 7, foliageMat, 0, 1.95 * scale, 0, g);
    terrainGroup.add(g); return g;
  }
  if (!promptScene) {
    if (terrain === 'desert') {
      dune(-3.0, 2.6, 1.9, 0.34); dune(3.1, -2.9, 1.6, 0.28); dune(2.6, 2.8, 1.2, 0.22); dune(-2.8, -2.8, 1.1, 0.18);
      rock(-3.5, 3.3, 0.35); rock(3.7, 3.0, 0.3); rock(-3.6, -3.2, 0.27);
      for (var grass = 0; grass < 10; grass++) cyl(0.006, 0.014, range(0.25, 0.6), 3, new T.MeshStandardMaterial({ color: new T.Color('#846f4f') }), range(-3.8, 3.8), topY + 0.18, range(-3.8, 3.8), terrainGroup);
    } else if (terrain === 'city') {
      for (var b = 0; b < 12; b++) {
        var bx = range(-3.9, 3.9), bz = range(-3.9, 3.9);
        if (Math.abs(bx) < 2.4 && Math.abs(bz) < 2.4) continue;
        var bh = range(0.3, 1.0);
        box(range(0.28, 0.7), bh, range(0.28, 0.7), darkMetal, bx, topY + bh / 2, bz, terrainGroup);
      }
      var wet = new T.Mesh(new T.PlaneGeometry(8.2, 8.2), wetMat); wet.rotation.x = -Math.PI / 2; wet.position.y = topY + 0.01; wet.receiveShadow = true; terrainGroup.add(wet);
      for (var neon = 0; neon < 5; neon++) box(range(0.6, 2.0), 0.03, 0.03, new T.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.8 }), range(-3.4, 3.4), topY + 0.16, range(-3.4, 3.4), terrainGroup);
    } else if (terrain === 'snow' || terrain === 'ice') {
      for (var ice = 0; ice < 12; ice++) {
        var ix = range(-3.8, 3.8), iz = range(-3.8, 3.8);
        if (Math.abs(ix) < 2.2 && Math.abs(iz) < 2.2) continue;
        var ic = cone(range(0.12, 0.35), range(0.5, 1.5), 4, snowMat, ix, topY + range(0.2, 0.7), iz, terrainGroup);
        ic.rotation.z = range(-0.25, 0.25);
      }
      rock(-3.2, 3.2, 0.3, stoneLight); rock(3.2, -3.3, 0.24, stoneLight);
    } else if (terrain === 'ash' || terrain === 'rock') {
      for (var ar = 0; ar < 10; ar++) rock(range(-3.8, 3.8), range(-3.8, 3.8), range(0.16, 0.5), terrain === 'ash' ? stoneMat : stoneLight);
      for (var dead = 0; dead < 3; dead++) {
        var dg = new T.Group(); dg.position.set(range(-3.2, 3.2), topY, range(-3.2, 3.2));
        cyl(0.03, 0.08, 1.1, 5, darkMetal, 0, 0.55, 0, dg);
        cyl(0.02, 0.04, 0.6, 5, darkMetal, 0.18, 0.95, 0, dg).rotation.z = -0.65;
        terrainGroup.add(dg);
      }
    } else if (terrain === 'cloud') {
      for (var cl = 0; cl < 12; cl++) {
        var cloud = sphere(range(0.7, 1.5), 12, new T.MeshStandardMaterial({ color: COOL, roughness: 1, transparent: true, opacity: 0.18 }), range(-3.6, 3.6), topY - 0.1 + range(-0.2, 0.2), range(-3.2, 3.2), terrainGroup);
        cloud.scale.y = 0.3;
      }
    } else if (terrain === 'forest') {
      for (var tr = 0; tr < 8; tr++) { var tx = range(-3.6, 3.6), tz = range(-3.6, 3.6); if (Math.abs(tx) < 2.1 && Math.abs(tz) < 2.1) continue; tree(tx, tz, range(0.7, 1.2)); }
    } else if (terrain === 'coast') {
      var water = new T.Mesh(new T.PlaneGeometry(8.2, 8.2), new T.MeshStandardMaterial({ color: new T.Color('#15282d'), metalness: 0.4, roughness: 0.25, transparent: true, opacity: 0.8 }));
      water.rotation.x = -Math.PI / 2; water.position.y = topY + 0.02; water.receiveShadow = true; terrainGroup.add(water);
      for (var cr = 0; cr < 5; cr++) rock(range(-3.7, 3.7), range(-3.7, 3.7), range(0.18, 0.4), stoneLight);
    } else {
      for (var gr = 0; gr < 8; gr++) rock(range(-3.6, 3.6), range(-3.6, 3.6), range(0.14, 0.32), stoneLight);
    }
  }

  // ---- main structure ----
  var main = new T.Group(); main.position.y = topY; world.add(main);
  var animated = [];
  function addGear(parent, x, y, z, radius, mat) {
    var g = new T.Group(); g.position.set(x, y, z);
    var disc = cyl(radius, radius, 0.12, 12, mat || metalMat, 0, 0, 0, g); disc.rotation.x = Math.PI / 2;
    for (var t = 0; t < 10; t++) {
      var tooth = box(0.1, 0.08, 0.22, mat || metalMat, Math.cos(t / 10 * Math.PI * 2) * radius, Math.sin(t / 10 * Math.PI * 2) * radius, 0, g);
      tooth.rotation.z = -t / 10 * Math.PI * 2;
    }
    g.rotation.x = 0; parent.add(g); animated.push({ obj: g, axis: 'z', speed: (radius > 0.5 ? 0.18 : -0.3) });
    return g;
  }
  function addPipe(parent, points, radius) {
    var curve = new T.CatmullRomCurve3(points.map(function (p) { return new T.Vector3(p[0], p[1], p[2]); }));
    var pipe = mesh(new T.TubeGeometry(curve, 24, radius || 0.08, 6, false), metalMat, 0, 0, 0, parent);
    return pipe;
  }
  function addArch(parent, x, z, scale, mat) {
    var g = new T.Group(); g.position.set(x, 0, z); g.scale.setScalar(scale || 1);
    var arc = new T.Mesh(new T.TorusGeometry(0.8, 0.12, 6, 20, Math.PI), mat || stoneLight);
    arc.position.y = 1.1; g.add(arc);
    box(0.18, 1.1, 0.18, mat || stoneLight, -0.8, 0.55, 0, g);
    box(0.18, 1.1, 0.18, mat || stoneLight, 0.8, 0.55, 0, g);
    parent.add(g); return g;
  }
  function addRose(parent, x, y, z, radius) {
    var g = new T.Group(); g.position.set(x, y, z);
    var outer = new T.Mesh(new T.TorusGeometry(radius, 0.08, 6, 24), metalMat); g.add(outer);
    for (var sp = 0; sp < 8; sp++) {
      var a = sp / 8 * Math.PI * 2;
      var bar = box(radius * 1.7, 0.04, 0.04, darkMetal, 0, 0, 0.03, g); bar.rotation.z = a;
    }
    var glow = new T.Mesh(new T.CircleGeometry(radius * 0.88, 20), new T.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.28, side: T.DoubleSide })); g.add(glow);
    parent.add(g); return g;
  }
  function addBeacon(parent, x, y, z) {
    var g = new T.Group(); g.position.set(x, y, z);
    cyl(0.1, 0.16, 1.3, 8, darkMetal, 0, 0.65, 0, g);
    sphere(0.17, 12, glowMat, 0, 1.35, 0, g);
    parent.add(g); return g;
  }
  function addSteam(parent, x, y, z, amount) {
    for (var s = 0; s < (amount || 5); s++) {
      var puff = sphere(range(0.12, 0.28), 8, new T.MeshStandardMaterial({ color: COOL, transparent: true, opacity: 0.18, roughness: 1, depthWrite: false }), x + range(-0.2, 0.2), y + range(0, 0.5), z + range(-0.2, 0.2), parent);
      animated.push({ obj: puff, axis: 'steam', speed: range(0.2, 0.5), baseY: puff.position.y, phase: rand() * 6 });
    }
  }

  if (promptScene) {
    var gable = new T.Shape();
    gable.moveTo(-0.5, -0.5); gable.lineTo(0.5, -0.5); gable.lineTo(0, 0.5); gable.closePath();
    var gableGeo = new T.ExtrudeGeometry(gable, { depth: 1, bevelEnabled: false });
    gableGeo.translate(0, 0, -0.5).rotateY(Math.PI / 2);
    var promptGeometries = {
      box: new T.BoxGeometry(1, 1, 1),
      cylinder: new T.CylinderGeometry(0.5, 0.5, 1, 24),
      cone: new T.ConeGeometry(0.5, 1, 12),
      sphere: new T.SphereGeometry(0.5, 24, 16),
      torus: new T.TorusGeometry(0.4, 0.1, 8, 32).scale(1, 1, 5),
      gable: gableGeo,
      rock: new T.DodecahedronGeometry(0.5),
      water: new T.PlaneGeometry(1, 1, 48, 48).rotateX(-Math.PI / 2),
      beam: new T.ConeGeometry(0.5, 1, 32, 1, true).translate(0, -0.5, 0).rotateZ(Math.PI / 2),
    };
    promptScene.parts.forEach(function (part) {
      var beam = part.shape === 'beam';
      var water = part.shape === 'water';
      var transparent = part.surface === 'glass' || beam;
      var metallic = part.surface === 'metal';
      var mat = new T.MeshStandardMaterial({
        color: water ? '#ffffff' : part.color, vertexColors: water,
        roughness: transparent || metallic || water ? 0.22 : 0.78, metalness: metallic ? 0.7 : water ? 0.25 : 0.02,
        transparent: transparent, opacity: beam ? 0.075 : transparent ? 0.22 : 1, depthWrite: !transparent,
        side: transparent ? T.DoubleSide : T.FrontSide,
        emissive: part.surface === 'glow' || beam ? part.color : '#000000', emissiveIntensity: 1.6,
      });
      part.at.forEach(function (pos) {
        var geometry = water ? promptGeometries.water.clone() : promptGeometries[part.shape];
        if (water) geometry.setAttribute('color', new T.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3), 3));
        var piece = mesh(geometry, mat, pos[0], pos[1] + 0.08, pos[2], main);
        piece.scale.set.apply(piece.scale, part.size);
        if (water) {
          piece.scale.y = 1;
          animated.push({ axis: 'water', obj: piece, amplitude: Math.min(0.22, part.size[1]), color: new T.Color(part.color) });
        }
        if (part.rot) piece.rotation.set.apply(piece.rotation, part.rot);
        if (transparent) piece.castShadow = false;
        if (part.motion) animated.push({
          obj: piece, axis: part.motion, baseY: piece.position.y, baseZ: piece.rotation.z, phase: rand() * 6,
        });
      });
    });
  } else if (isShell) {
    var shell = new T.Group(); shell.position.set(0, 2.2, 0.1); main.add(shell);
    var turns = 3.25, steps = 120;
    var outer = [], inner = [];
    for (var i = 0; i <= steps; i++) {
      var tt = i / steps;
      var aa = tt * Math.PI * 2 * turns - 0.3;
      var ro = 3.0 * (1 - tt * 0.8) + 0.34;
      var ri = Math.max(0.16, ro - (0.62 * (1 - tt * 0.5) + 0.1));
      outer.push([Math.cos(aa) * ro, Math.sin(aa) * ro]);
      inner.push([Math.cos(aa) * ri, Math.sin(aa) * ri]);
    }
    var shape = new T.Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (var so = 1; so < outer.length; so++) shape.lineTo(outer[so][0], outer[so][1]);
    for (var si2 = inner.length - 1; si2 >= 0; si2--) shape.lineTo(inner[si2][0], inner[si2][1]);
    shape.closePath();
    var shellGeo = new T.ExtrudeGeometry(shape, { depth: 0.86, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 1, steps: 1, curveSegments: 4 });
    shellGeo.center();
    var shellRibbon = mesh(shellGeo, metalMat, 0, 0, 0, shell);
    // warm core at the center of the spiral
    var hub = new T.Group(); shell.add(hub);
    cyl(0.55, 0.7, 0.9, 12, darkMetal, 0, 0, 0.15, hub); hub.rotation.x = Math.PI / 2;
    sphere(0.28, 12, glowMat, 0, 0, 0.62, hub);
    ring(0.62, 0.08, metalMat, 0, 0, 0.54, hub).rotation.x = Math.PI / 2;
    // front and back rims
    [0.34, -0.34].forEach(function (zz) {
      var rimPts = [];
      for (var rp = 0; rp < outer.length; rp += 2) rimPts.push(new T.Vector3(outer[rp][0], outer[rp][1], zz));
      var rimCurve = new T.CatmullRomCurve3(rimPts);
      mesh(new T.TubeGeometry(rimCurve, 90, 0.055, 6, false), darkMetal, 0, 0, 0, shell);
    });
    // inset portholes on the shell face
    for (var w = 0; w < 5; w++) {
      var wt = 0.16 + w * 0.12;
      var wa = wt * Math.PI * 2 * turns - 0.3;
      var wr = 3.0 * (1 - wt * 0.8) + 0.34 - (0.31 * (1 - wt * 0.5) + 0.05);
      var wx = Math.cos(wa) * wr, wy = Math.sin(wa) * wr;
      var port = cyl(0.16, 0.16, 0.08, 10, darkMetal, wx, wy, 0.48, shell); port.rotation.x = Math.PI / 2;
      var portGlow = cyl(0.11, 0.11, 0.02, 10, glowMat, wx, wy, 0.53, shell); portGlow.rotation.x = Math.PI / 2;
    }
    // city huts along the outer edge
    for (var hut = 0; hut < 7; hut++) {
      var ht = 0.12 + hut / 7 * 0.76;
      var ha = ht * Math.PI * 2 * turns - 0.3;
      var hr = 3.0 * (1 - ht * 0.8) + 0.34 + 0.06;
      var hx = Math.cos(ha) * hr, hy = Math.sin(ha) * hr;
      var hs = 0.55 + (1 - ht) * 0.45;
      var hutGroup = new T.Group(); hutGroup.position.set(hx, hy, 0.35); shell.add(hutGroup);
      box(0.72 * hs, 0.72 * hs, 0.62 * hs, stoneLight, 0, 0, 0, hutGroup);
      cone(0.56 * hs, 0.48 * hs, 4, darkMetal, 0, 0.6 * hs, 0, hutGroup);
      addGlowWindow(hutGroup, 0, 0.04, 0.32 * hs, 0.28 * hs, 0.22 * hs, 0);
      if (hut % 2 === 0) { cyl(0.14 * hs, 0.2 * hs, 0.8 * hs, 7, metalMat, 0.3, 0.4 * hs, 0.2, hutGroup); cone(0.24 * hs, 0.34 * hs, 6, darkMetal, 0.3, 0.82 * hs, 0.2, hutGroup); }
    }
    // a proper city spire on top of the shell
    cyl(0.18, 0.26, 1.1, 7, darkMetal, 0.2, 3.1, 0.4, shell);
    cone(0.4, 0.7, 6, metalMat, 0.2, 3.9, 0.4, shell);
    sphere(0.12, 8, glowMat, 0.2, 4.3, 0.4, shell);
    // engine block and mechanical neck / body below the shell
    var body = sphere(1.38, 18, accentMat, 0, -1.35, 0.45, shell); body.scale.set(1.25, 0.7, 1.4);
    var head = sphere(0.82, 16, accentMat, 0, -1.2, 1.85, shell); head.scale.set(1.18, 0.9, 1.05);
    var snout = cyl(0.34, 0.48, 0.62, 9, metalMat, 0, -1.36, 2.42, shell); snout.rotation.x = Math.PI / 2;
    for (var band = 0; band < 3; band++) { var bnd = new T.Mesh(new T.TorusGeometry(1.05 - band * 0.16, 0.055, 6, 24), metalMat); bnd.position.set(0, -1.05 - band * 0.32, 0.5); bnd.rotation.x = Math.PI / 2; shell.add(bnd); }
    addPipe(shell, [[-1.15, -1.2, 1.1], [-0.9, -0.8, 1.3], [-0.4, -0.9, 1.6]], 0.05);
    addPipe(shell, [[1.1, -1.2, 1.1], [0.85, -0.7, 1.35], [0.35, -0.85, 1.62]], 0.05);
    // mechanical cockpit, jaw and headlamp instead of eyes
    var cockpit = box(0.9, 0.56, 0.4, darkMetal, 0, -1.1, 2.35, shell); cockpit.rotation.x = -0.08;
    addGlowWindow(shell, 0, -1.08, 2.57, 0.58, 0.28, 0);
    var jaw = cone(0.45, 0.5, 6, metalMat, 0, -1.45, 2.5, shell); jaw.rotation.x = Math.PI / 2; jaw.rotation.z = Math.PI / 6;
    var lamp = sphere(0.14, 10, glowMat, 0, -0.55, 2.15, shell);
    cyl(0.04, 0.06, 0.55, 6, darkMetal, 0, -0.75, 2.05, shell);
    addPipe(shell, [[-0.55, -1.4, 2.0], [-0.85, -1.0, 1.8], [-1.0, -0.7, 1.5]], 0.045);
    addPipe(shell, [[0.55, -1.4, 2.0], [0.85, -1.0, 1.8], [1.0, -0.7, 1.5]], 0.045);
    // six legs touching the plinth top
    for (var leg = 0; leg < 6; leg++) {
      var side = leg < 3 ? -1 : 1, slot = leg % 3;
      var lx = side * (1.2 + slot * 0.42), lz = 1.0 - slot * 1.05;
      var upper = cyl(0.13, 0.19, 1.25, 7, darkMetal, lx, -0.7, lz, shell); upper.rotation.z = side * 0.55;
      var lower = cyl(0.12, 0.23, 1.05, 7, metalMat, lx + side * 0.48, -1.42, lz, shell); lower.rotation.z = -side * 0.18;
      sphere(0.18, 8, accentMat, lx + side * 0.5, -1.9, lz, shell);
      sphere(0.13, 8, darkMetal, lx, -0.05, lz, shell);
    }
    // engine / boiler / smoke at the rear
    var engine = new T.Group(); engine.position.set(-1.85, -1.4, -0.25); shell.add(engine);
    box(0.95, 0.85, 1.05, darkMetal, 0, 0.4, 0, engine);
    cyl(0.22, 0.3, 1.35, 10, metalMat, 0.42, 0.9, -0.1, engine);
    addSteam(shell, -1.6, 1.2, -0.55, 10);
    addGear(engine, -0.55, 0.55, 0.1, 0.4, metalMat);
    addGear(engine, 0.5, 0.48, 0.15, 0.27, accentMat);
    // copper pipes and beacon
    addPipe(shell, [[-2.4, -0.4, 0.5], [-2.0, 0.5, 0.7], [-1.2, 1.0, 0.5], [-0.4, 0.5, 0.2], [0.2, -0.1, 0.1]], 0.065);
    addPipe(shell, [[-1.9, -0.9, -0.7], [-1.2, -0.1, -0.5], [-0.3, 0.4, -0.2], [0.6, 0.9, 0.0], [1.3, 1.4, 0.1]], 0.05);
    addBeacon(shell, 0.2, 3.05, 0.55);
    for (var sig = 0; sig < 3; sig++) cyl(0.02, 0.03, 0.75, 5, darkMetal, -0.6 + sig * 0.55, 3.25, 0.5, shell);
    // rope / banner details
    for (var flag = 0; flag < 3; flag++) box(0.04, 0.22, 0.36, accentMat, -0.8 + flag * 0.7, 0.9 - flag * 0.22, 0.55, shell);
    // foreground outpost
    var outpost = new T.Group(); outpost.position.set(-2.9, 0, 2.6); terrainGroup.add(outpost);
    var outpost2 = new T.Group(); outpost2.position.set(3.0, 0, -1.1); terrainGroup.add(outpost2);
    box(0.7, 0.45, 0.6, stoneLight, 0, 0.28, 0, outpost);
    cone(0.62, 0.36, 4, darkMetal, 0, 0.62, 0, outpost);
    addGlowWindow(outpost, 0, 0.3, 0.31, 0.22, 0.18, 0);
    for (var crate = 0; crate < 3; crate++) box(0.18, 0.16, 0.18, darkMetal, 0.55 + crate * 0.22, 0.15, 0.25, outpost);
    box(1.4, 0.4, 0.9, stoneLight, 0, 0.25, 0, outpost2);
    cone(1.0, 0.6, 4, darkMetal, 0, 0.75, 0, outpost2);
    addGlowWindow(outpost2, 0, 0.28, 0.46, 0.45, 0.2, 0);
    for (var post = -1; post <= 1; post += 2) cyl(0.05, 0.07, 1.0, 5, darkMetal, post * 0.55, 1.0, -0.4, outpost2);
    for (var stonePath = 0; stonePath < 7; stonePath++) box(0.38, 0.05, 0.26, stoneLight, -1.5 + stonePath * 0.42, topY + 0.06, 3.4 - stonePath * 0.12, terrainGroup);
  } else if (isObservatory) {
    var obs = new T.Group(); obs.position.y = 0; main.add(obs);
    cyl(1.5, 2.0, 0.6, 8, stoneMat, 0, 0.3, 0, obs);
    cyl(1.1, 1.5, 2.2, 10, stoneLight, 0, 1.7, 0, obs);
    var dome = new T.Mesh(new T.SphereGeometry(1.45, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), metalMat); dome.position.y = 2.8; obs.add(dome);
    var scope = cyl(0.2, 0.28, 2.1, 10, darkMetal, 0.5, 3.35, 0.2, obs); scope.rotation.z = -0.65; scope.rotation.x = 0.2;
    addGlowWindow(obs, 0, 2.0, 1.15, 0.5, 0.5, 0);
    addArch(obs, 0, 1.7, 0.9, stoneLight);
    addBeacon(obs, -1.1, 2.6, -0.6);
    addGear(obs, 1.2, 1.0, 0.6, 0.34, metalMat);
    addPipe(obs, [[-1.0, 0.8, 0.6], [-1.4, 1.8, 0.3], [-0.8, 2.4, -0.1]], 0.07);
    if (/星图/.test(motifs)) addRose(obs, 0, 1.7, 1.22, 0.4);
  } else if (isShrine) {
    var shrine = new T.Group(); main.add(shrine);
    box(2.8, 0.25, 4.0, stoneLight, 0, 0.15, 0, shrine);
    box(2.2, 1.9, 3.2, stoneMat, 0, 1.2, 0, shrine);
    var roof = new T.Mesh(new T.ConeGeometry(2.4, 1.4, 4), darkMetal); roof.rotation.y = Math.PI / 4; roof.position.y = 2.8; shrine.add(roof);
    for (var arch = -1; arch <= 1; arch++) addArch(shrine, arch * 1.2, 1.62, 1.0, stoneLight);
    addRose(shrine, 0, 1.85, 1.63, 0.58);
    addGlowWindow(shrine, -1.25, 1.0, 1.63, 0.26, 0.7, 0);
    addGlowWindow(shrine, 1.25, 1.0, 1.63, 0.26, 0.7, 0);
    addBeacon(shrine, -2.0, 1.4, 0.5);
    if (/藤|树|苔/.test(motifs)) { for (var vt = 0; vt < 4; vt++) addPipe(shrine, [[-1.5, 0.2, 1.3 - vt * 0.5], [-0.5, 1.2, 1.4 - vt * 0.5], [0.9, 2.3, 1.4 - vt * 0.5]], 0.035); }
  } else if (isShop) {
    var shop = new T.Group(); main.add(shop);
    box(2.7, 1.5, 2.5, stoneMat, 0, 0.9, 0, shop);
    box(2.9, 0.2, 2.7, darkMetal, 0, 1.72, 0, shop);
    cyl(0.26, 0.32, 1.9, 8, metalMat, -0.8, 1.8, -0.7, shop);
    addSteam(shop, -0.8, 2.8, -0.7, 6);
    addGear(shop, 0.85, 1.0, 0.8, 0.45, metalMat);
    addGear(shop, 0.3, 0.65, 0.8, 0.28, accentMat);
    addGlowWindow(shop, 0, 1.05, 1.28, 0.9, 0.55, 0);
    addPipe(shop, [[-1.1, 0.45, 0.8], [-1.2, 1.8, 0.6], [0.0, 2.5, 0.4], [1.2, 2.2, 0.45]], 0.07);
    addBeacon(shop, 1.35, 0.5, -1.0);
  } else if (isStation) {
    var station = new T.Group(); main.add(station);
    box(3.4, 0.25, 2.4, stoneLight, 0, 0.15, 0, station);
    box(2.7, 0.25, 1.8, stoneMat, 0, 0.4, 0, station);
    for (var pillar = -1; pillar <= 1; pillar++) {
      box(0.2, 1.7, 0.2, darkMetal, pillar * 1.0, 1.25, 0.8, station);
    }
    box(2.7, 0.18, 0.25, darkMetal, 0, 2.1, 0.8, station);
    var gate = addArch(station, 0, 0.8, 1.3, stoneLight);
    addGlowWindow(station, 0, 1.1, 0.3, 0.7, 0.9, 0);
    addBeacon(station, 1.5, 0.5, -0.8);
    addPipe(station, [[-1.6, 0.6, -0.8], [-1.2, 1.4, -0.8], [-0.8, 2.0, -0.5]], 0.08);
    addSteam(station, 1.4, 0.6, -0.8, 4);
  } else if (isGarden) {
    var garden = new T.Group(); main.add(garden);
    box(3.4, 0.3, 3.4, stoneLight, 0, 0.15, 0, garden);
    for (var gw = 0; gw < 4; gw++) {
      box(3.0, 0.7, 0.18, stoneMat, 0, 0.5, -1.6 + gw * 1.07, garden);
    }
    var dome2 = new T.Mesh(new T.SphereGeometry(1.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), accentMat); dome2.position.y = 1.6; garden.add(dome2);
    addGlowWindow(garden, 0, 1.0, 0.5, 0.6, 0.5, 0);
    for (var gt = 0; gt < 6; gt++) tree(range(-2.7, 2.7), range(-2.7, 2.7), range(0.4, 0.7));
    addBeacon(garden, -1.7, 0.3, -1.7);
  } else {
    var tower = new T.Group(); main.add(tower);
    cyl(1.7, 2.1, 0.4, 8, stoneMat, 0, 0.2, 0, tower);
    cyl(1.2, 1.6, 2.6, 8, stoneLight, 0, 1.5, 0, tower);
    cyl(0.9, 1.2, 1.6, 8, stoneMat, 0, 3.1, 0, tower);
    box(2.6, 0.2, 2.6, darkMetal, 0, 0.45, 0, tower);
    for (var tw = 0; tw < 4; tw++) {
      var ang = tw / 4 * Math.PI * 2;
      addArch(tower, Math.cos(ang) * 1.45, Math.sin(ang) * 1.45, 0.7, stoneLight).rotation.y = -ang;
    }
    addGlowWindow(tower, 0, 1.9, 1.32, 0.38, 0.7, 0);
    addGlowWindow(tower, 0, 3.2, 1.02, 0.3, 0.5, 0);
    var spire = cone(1.1, 2.2, 8, darkMetal, 0, 4.5, 0, tower);
    addBeacon(tower, 0, 5.3, 0);
    addGear(tower, 1.1, 1.1, 1.1, 0.4, metalMat);
    addPipe(tower, [[-1.1, 0.4, 0.7], [-1.5, 1.8, 0.5], [-1.0, 3.0, 0.2]], 0.07);
    addRose(tower, 0, 2.7, 0.95, 0.42);
  }

  // Legacy assets keep their original procedural details.
  if (!promptScene) {
    // extra motif props
    if (/灯/.test(motifs)) addBeacon(main, 2.2, 1.3, 2.0);
    if (/齿轮/.test(motifs)) addGear(main, -2.0, 1.1, 1.3, 0.3, metalMat);
    if (/铜管|管道/.test(motifs)) addPipe(main, [[-2.3, 1.1, 1.4], [-1.8, 2.1, 1.2], [-0.8, 2.5, 0.9]], 0.06);
    if (/鲸骨|骨/.test(motifs)) {
      for (var rib = 0; rib < 5; rib++) {
        var arc2 = new T.Mesh(new T.TorusGeometry(1.12 + rib * 0.16, 0.055, 6, 22, Math.PI * 0.92), new T.MeshStandardMaterial({ color: new T.Color('#d7d0bc'), roughness: 0.8 }));
        arc2.position.set(0, 1.1, -1.2 + rib * 0.35); arc2.rotation.y = 0.2; main.add(arc2);
      }
    }
    if (/藤|树|苔/.test(motifs)) for (var mm = 0; mm < 4; mm++) tree(range(-3.1, 3.1), range(-3.1, 3.1), range(0.55, 0.9));

    // ---- DeepSeek scene plan parts ----
    if (cfg.design && Array.isArray(cfg.design.parts)) {
      var paletteMats = [metalMat, darkMetal, stoneLight, accentMat, coolMat, warmMat];
      var designPartCount = 0;
      cfg.design.parts.slice(0, 10).forEach(function (part) {
        if (!part || !part.type) return;
        var pos = part.pos || [0, 2, 0], size = part.size || [0.6, 0.6, 0.6];
        var px = Math.max(-4.2, Math.min(4.2, Number(pos[0]) || 0));
        var py = Math.max(1.05, Math.min(6.5, Number(pos[1]) || 2));
        var pz = Math.max(-4.2, Math.min(4.2, Number(pos[2]) || 0));
        var sx = Math.max(0.04, Math.min(3.2, Math.abs(Number(size[0]) || 0.5)));
        var sy = Math.max(0.04, Math.min(3.2, Math.abs(Number(size[1]) || sx)));
        var sz = Math.max(0.04, Math.min(3.2, Math.abs(Number(size[2]) || sx)));
        var maxSize = Math.max(sx, sy, sz);
        if (maxSize > 1.15) return;
        if (Math.abs(px) < 1.55 && Math.abs(pz) < 1.55 && maxSize > 0.58) return;
        if (designPartCount >= 6) return;
        designPartCount += 1;
        var mat = part.emissive ? glowMat : paletteMats[Math.max(0, Math.min(5, Number(part.color) || 0))];
        var piece = null;
        if (part.type === 'box') piece = mesh(new T.BoxGeometry(sx, sy, sz), mat, px, py, pz, world);
        else if (part.type === 'cylinder') piece = mesh(new T.CylinderGeometry(sx, sx * 1.08, sy, 8), mat, px, py, pz, world);
        else if (part.type === 'cone') piece = mesh(new T.ConeGeometry(sx, sy, 7), mat, px, py, pz, world);
        else if (part.type === 'sphere') piece = mesh(new T.SphereGeometry(sx, 12, 8), mat, px, py, pz, world);
        else if (part.type === 'torus') piece = mesh(new T.TorusGeometry(sx, Math.max(0.04, sy * 0.12), 6, 22), mat, px, py, pz, world);
        if (piece && Array.isArray(part.rot)) piece.rotation.set(Number(part.rot[0]) || 0, Number(part.rot[1]) || 0, Number(part.rot[2]) || 0);
      });
    }
  }

  // ---- sky / atmosphere ----
  var starGeo = new T.BufferGeometry();
  var starPos = [];
  for (var st = 0; st < 300; st++) {
    var sr = 32 + rand() * 20, sa = rand() * Math.PI * 2, sb = rand() * Math.PI * 0.55 + 0.15;
    starPos.push(Math.cos(sa) * Math.sin(sb) * sr, Math.cos(sb) * sr, Math.sin(sa) * Math.sin(sb) * sr);
  }
  starGeo.setAttribute('position', new T.Float32BufferAttribute(starPos, 3));
  var stars = new T.Points(starGeo, new T.PointsMaterial({ color: COOL, size: 0.08, transparent: true, opacity: 0.5, depthWrite: false }));
  if (promptScene) stars.visible = false;
  scene.add(stars);

  var dustGeo = new T.BufferGeometry();
  var dustPos = [];
  for (var dp = 0; dp < 260; dp++) dustPos.push(range(-7, 7), range(0.4, 7), range(-7, 7));
  dustGeo.setAttribute('position', new T.Float32BufferAttribute(dustPos, 3));
  var dust = new T.Points(dustGeo, new T.PointsMaterial({ color: isSnow ? new T.Color('#e8f2f5') : WARM, size: isSnow ? 0.055 : 0.035, transparent: true, opacity: 0.42, depthWrite: false }));
  if (promptScene) {
    dust.visible = !isRain && promptScene.weather !== 'clear';
  }
  scene.add(dust);

  var rain = null;
  if (promptScene && isRain) {
    var rainPositions = [];
    for (var drop = 0; drop < 850; drop++) {
      var rx = range(-6, 6), ry = range(0.5, 8), rz = range(-6, 6);
      rainPositions.push(rx, ry, rz, rx + 0.06, ry - 0.28, rz);
    }
    var rainGeometry = new T.BufferGeometry();
    rainGeometry.setAttribute('position', new T.Float32BufferAttribute(rainPositions, 3));
    rain = new T.LineSegments(rainGeometry, new T.LineBasicMaterial({ color: COOL, transparent: true, opacity: 0.4, depthWrite: false }));
    scene.add(rain);
    scene.fog.density = 0.038;
  }

  var hemi = new T.HemisphereLight(COOL, BG, 0.95);
  scene.add(hemi);
  var key = new T.DirectionalLight(COOL, 3.1);
  key.position.set(-8, 12, 7); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 1; key.shadow.camera.far = 35; key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 9; key.shadow.camera.bottom = -9;
  scene.add(key);
  var fill = new T.DirectionalLight(new T.Color('#5c7fa8'), 1.25);
  fill.position.set(7, 6, -6); scene.add(fill);
  var warm = new T.PointLight(WARM, 34, 18, 2);
  warm.position.set(0, 3.2, 4); scene.add(warm);
  var warm2 = new T.PointLight(WARM, 20, 12, 2);
  warm2.position.set(-3, 2.2, -1.5); scene.add(warm2);
  var rim = new T.PointLight(ACCENT, 20, 17, 2);
  rim.position.set(4.5, 4.5, -4.5); scene.add(rim);

  // ---- camera + controls ----
  function frameRadius() {
    return promptScene ? 21 / Math.max(0.28, Math.min(1, camera.aspect)) : 21;
  }
  var defaultRadius = frameRadius();
  var maxRadius = promptScene ? defaultRadius * 1.25 : 24;
  var state = { theta: 0.9, phi: 1.02, radius: defaultRadius, target: new T.Vector3(0, 2.35, 0), auto: showcase, resumeAt: 0 };
  if (cfg.design) {
    if (cfg.design.fog) scene.fog.density = Math.max(0.008, Math.min(0.05, Number(cfg.design.fog)));
    if (cfg.design.lightWarm) warm.intensity = 34 * Math.max(0.4, Math.min(2, Number(cfg.design.lightWarm)));
    if (cfg.design.camera) {
      state.theta = Math.max(-1.3, Math.min(1.3, Number(cfg.design.camera.theta) || 0.9));
      state.phi = Math.max(0.7, Math.min(1.32, Number(cfg.design.camera.phi) || 1.02));
      state.radius = Math.max(15, Math.min(26, Number(cfg.design.camera.radius) || 21));
    }
  }
  function applyCamera() {
    var sp = Math.sin(state.phi), cp = Math.cos(state.phi);
    camera.position.set(state.target.x + state.radius * sp * Math.cos(state.theta), state.target.y + state.radius * cp, state.target.z + state.radius * sp * Math.sin(state.theta));
    camera.lookAt(state.target);
  }
  applyCamera();
  var dom = renderer.domElement;
  var pointers = new Map(), lastX = 0, lastY = 0, pinchDist = 0, pinchRadius = 0;
  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try { dom.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { lastX = e.clientX; lastY = e.clientY; }
    else if (pointers.size === 2) { var a = Array.from(pointers.values()); pinchDist = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); pinchRadius = state.radius; }
    state.auto = false; state.resumeAt = 0; dom.style.cursor = 'grabbing';
  }
  function move(e) {
    var p = pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      var dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
      state.theta -= dx * 0.005; state.phi = Math.max(0.55, Math.min(1.33, state.phi - dy * 0.0043));
    } else if (pointers.size === 2) {
      var a = Array.from(pointers.values()); var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      if (pinchDist > 0) state.radius = Math.max(8.5, Math.min(maxRadius, pinchRadius * pinchDist / Math.max(1, d)));
    }
    applyCamera();
  }
  function up(e) {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) { var p = Array.from(pointers.values())[0]; lastX = p.x; lastY = p.y; }
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) { dom.style.cursor = 'grab'; state.resumeAt = performance.now() + 7000; }
  }
  function wheel(e) { e.preventDefault(); state.radius = Math.max(8.5, Math.min(maxRadius, state.radius + e.deltaY * 0.008)); applyCamera(); state.resumeAt = performance.now() + 7000; }
  function dbl() { state.theta = 0.9; state.phi = 1.02; state.radius = defaultRadius; state.target.set(0, 2.35, 0); applyCamera(); }
  dom.style.touchAction = 'none'; dom.style.cursor = 'grab';
  dom.addEventListener('pointerdown', down); dom.addEventListener('pointermove', move); dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
  dom.addEventListener('wheel', wheel, { passive: false }); dom.addEventListener('dblclick', dbl);
  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    if (promptScene) {
      var radius = frameRadius();
      state.radius = Math.max(8.5, state.radius * radius / defaultRadius);
      defaultRadius = radius;
      maxRadius = radius * 1.25;
    }
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  var clock = new T.Clock();
  var frames = 0;
  function updateWater(wave, time) {
    var geometry = wave.obj.geometry;
    var vertices = geometry.attributes.position;
    var shades = geometry.attributes.color;
    for (var vertex = 0; vertex < vertices.count; vertex++) {
      var x = vertices.getX(vertex) * wave.obj.scale.x;
      var z = vertices.getZ(vertex) * wave.obj.scale.z;
      var height = Math.sin(x * 2.8 + time * 1.65) * 0.6 + Math.cos(z * 3.5 + x * 0.5 - time * 1.2) * 0.4;
      vertices.setY(vertex, height * wave.amplitude);
      var foam = Math.pow(Math.max(0, (height - 0.55) / 0.45), 2) * 0.85;
      shades.setXYZ(vertex, wave.color.r + (0.78 - wave.color.r) * foam, wave.color.g + (0.87 - wave.color.g) * foam, wave.color.b + (0.9 - wave.color.b) * foam);
    }
    vertices.needsUpdate = true;
    shades.needsUpdate = true;
    geometry.computeVertexNormals();
  }
  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(0.05, clock.getDelta());
    var now = performance.now();
    if (!state.auto && state.resumeAt && now > state.resumeAt) state.auto = showcase;
    if (state.auto) state.theta += dt * 0.055;
    applyCamera();
    for (var i = 0; i < animated.length; i++) {
      var a = animated[i];
      if (a.axis === 'steam') {
        a.obj.position.y += dt * a.speed * 0.6;
        a.obj.position.x += Math.sin(now * 0.001 + a.phase) * dt * 0.06;
        a.obj.material.opacity = Math.max(0, 0.18 - (a.obj.position.y - a.baseY) * 0.035);
        if (a.obj.position.y > a.baseY + 3) { a.obj.position.y = a.baseY; a.obj.material.opacity = 0.18; }
      } else if (a.axis === 'water') {
        updateWater(a, clock.elapsedTime);
      } else if (a.axis === 'spin') {
        a.obj.rotation.y += dt * 0.42;
      } else if (a.axis === 'sway') {
        a.obj.rotation.z = a.baseZ + Math.sin(now * 0.0016 + a.phase) * 0.08;
      } else if (a.axis === 'bob') {
        a.obj.position.y = a.baseY + Math.sin(now * 0.0016 + a.phase) * 0.08;
      } else if (a.obj.rotation) {
        a.obj.rotation.z += dt * a.speed;
      }
    }
    var positions = dust.geometry.attributes.position;
    for (var d = 0; d < positions.count; d++) {
      var speed = promptScene && isRain ? -4.6 : (isSnow ? (promptScene ? -0.48 : 0.22) : 0.08);
      var y = positions.getY(d) + dt * speed;
      if (y > 7.2) y = 0.5;
      if (y < 0.4) y = 7.2;
      positions.setY(d, y);
      positions.setX(d, positions.getX(d) + Math.sin(now * 0.0002 + d) * dt * 0.01);
    }
    positions.needsUpdate = true;
    if (rain) {
      var drops = rain.geometry.attributes.position;
      for (var ri = 0; ri < drops.count; ri += 2) {
        var nextY = drops.getY(ri) - dt * 8.0;
        var nextX = drops.getX(ri) + dt * 1.7;
        if (nextY < 0.5) { nextY = 8; nextX = range(-6, 6); }
        drops.setXYZ(ri, nextX, nextY, drops.getZ(ri));
        drops.setXYZ(ri + 1, nextX + 0.06, nextY - 0.28, drops.getZ(ri));
      }
      drops.needsUpdate = true;
      var lightningPhase = (clock.elapsedTime + 6.5) % 9;
      var flash = promptScene.weather === 'storm' && (lightningPhase < 0.09 || lightningPhase > 0.18 && lightningPhase < 0.23);
      key.intensity = flash ? 9 : 3.1;
      scene.background.copy(BG).lerp(new T.Color('#b6cbdc'), flash ? 0.38 : 0);
    }
    stars.rotation.y += dt * 0.006;
    renderer.render(scene, camera);
    frames += 1;
    if (frames === 2) { window.__MA_READY = true; }
  }
  animate();
})();
