// Where things live. Three fields (path, glade, wet) plus height are the whole ecology:
// every layer, plant or animal, is one rule over those fields, scattered on a hashed grid around the walker.
import * as THREE from 'three'
import { hash, noise, fbm, sat, mix } from './noise.js'
import * as F from './forms.js'

export const trail = z => 45 * (noise(z * .011, 3.3, 5) - .5) + 12 * (noise(z * .035, 8.1, 6) - .5)
export const fields = (x, z) => ({
  path: Math.abs(x - trail(z)),                               // metres from the footpath
  glade: sat((fbm(x * .012, z * .012, 3, 1) - .54) * 9),      // 1 in a clearing
  wet: fbm(x * .008, z * .008, 3, 2),                         // damp hollows: spruce, fern, moss, mist
  gap: sat(noise(x * .045, z * .045, 7) * 4 - 1.3),             // 0 where the canopy opens and sun reaches the floor
})
export const height = (x, z) => 16 * fbm(x * .006, z * .006, 4, 3) + 1.5 * fbm(x * .04, z * .04, 2, 4) - .2 * Math.exp(-(((x - trail(z)) / 3) ** 2)) // every feature is wider than the ground sheet's 2 m grid, so plants sit on it

const many = (n, f) => Array.from({ length: n }, f)
const pick = (r, n, first = 0) => first + (r() * n | 0)
const fly = (R, H, v, flutter = 0) => (d, o, t) => { // wander a looping orbit around home, nose along the path of travel, bobbing as it goes
  const at = k => { const a = (t + k) * v / R * (o.h > .5 ? 1 : -1) + o.h * 99
    return d.position.set(o.x + Math.cos(a) * R * (.5 + o.h), o.y + H * (.6 + .4 * o.h) + Math.sin(a * 2.3 + o.h * 9) * H * .1 + Math.sin((t + k) * 8 + o.h * 70) * flutter, o.z + Math.sin(a * 1.3) * R) }
  const next = at(.2).clone()
  at(0); d.lookAt(next)
}

export function populate(scene, P, mats, rnd) {
  const S = F.species, grow = (sp, n = 4) => many(n, () => F.tree(P, sp, rnd))
  const fallen = (sp, n) => grow(sp, n).map(f => (f.geometry.rotateZ(Math.PI / 2).translate(0, f.radius * .7, 0), f))
  const layers = [
    { cell: 5, radius: 175, sink: .3, forms: [S.spruce, S.beech, S.birch, S.snag, S.pine, S.oak].flatMap(sp => grow(sp)), rule: (e, r) => {
      if (e.path < 2.4 || r() > .8 * (1 - .95 * e.glade) * (.25 + .75 * e.gap)) return
      const k = r(), damp = e.wet + (r() - .5) * .2 > .5
      const kind = k < .04 ? 3 : damp ? (k < .6 ? 0 : k < .8 ? 4 : 2) : k < .45 ? 1 : k < .7 ? 5 : k < .85 ? 2 : 4
      return [pick(r, 4, kind * 4), .7 + r() * .6] } },
    { cell: 4.3, radius: 115, forms: [S.bush, S.fir, S.bramble].flatMap(sp => grow(sp, 3)), rule: (e, r) => e.path > 4 && r() < .36 - .2 * e.glade && [pick(r, 3, r() < .3 ? 6 : e.wet > .5 ? 3 : 0), .5 + r() * .7] },
    { cell: 1.4, radius: 58, shadow: false, rule: (e, r) => e.path > 1 && r() < (.14 + .55 * sat(e.wet * 5 - 2.1)) * (1 - .8 * e.glade) && [pick(r, 5, e.wet > .47 ? 0 : 5), .7 + r() * .7],
      forms: [...many(3, () => F.herb(P, rnd)), ...many(2, () => F.herb(P, rnd, 2, [1.1, .75, .3], .6, 1.2)),            // fern, bracken
        ...many(3, () => F.herb(P, rnd, 0, [.4, .6, .3], .35, .5)), ...many(2, () => F.herb(P, rnd, 3, [.5, .7, .35], 1.2, .45))] }, // nettle, ground cover
    { cell: .8, radius: 38, shadow: false, rule: (e, r) => e.path > .7 && r() < .1 + .85 * e.glade && [e.glade > .3 ? pick(r, 5) : pick(r, 4, 3), .7 + r()],
      forms: [...many(3, () => F.tuft(P, rnd)), ...many(2, () => F.tuft(P, rnd, .55, .25, [.4, .36, .14])), ...many(2, () => F.tuft(P, rnd, .5, .15, [.06, .14, .05], 30))] }, // lawn, seeding, sedge
    { cell: 1.1, radius: 30, shadow: false, forms: [[.2, .22, .85], [.85, .85, .8], [.9, .72, .06], [.8, .2, .42], [.42, .18, .72]].map(c => F.flower(P, rnd, c)), // each drift is one species
      rule: (e, r) => e.path > .6 && r() < .7 * sat(noise(e.x * .07, e.z * .07, 11) * 5 - 3) + .2 * e.glade && [r() < .15 ? pick(r, 5) : noise(e.x * .02, e.z * .02, 12) * 15 % 5 | 0, .7 + r() * .8] },
    { cell: 6, radius: 80, sink: .25, tilt: .6, forms: [...many(5, () => F.rock(P, rnd)), ...many(3, () => F.rock(P, rnd, 1))], rule: (e, r) => e.path > 1.5 && r() < .28 && [e.wet > .5 && r() < .5 ? pick(r, 3, 5) : pick(r, 5), .2 + 1.8 * r() ** 3] },
    { cell: 13, radius: 80, tilt: .15, forms: fallen(S.log, 3), rule: (e, r) => e.path > 4 && r() < .35 && [pick(r, 3), .8 + r() * .5] },
    { cell: 7, radius: 50, forms: fallen(S.branch, 3), rule: (e, r) => r() < .3 * (1 - e.glade) && [pick(r, 3), .5 + r() * .7] },
    { cell: 2.5, radius: 28, forms: many(4, () => F.mushroom(P, rnd)), rule: (e, r) => r() < .25 * sat(e.wet * 4 - 1.5) && [pick(r, 4), .7 + r()] },
    { cell: 1.1, radius: 24, shadow: false, tilt: .3, forms: many(3, () => F.litter(P, rnd)), rule: (e, r) => r() < .5 * (1 - e.glade) && [pick(r, 3), .5 + r()] },
    { cell: 6, radius: 36, shadow: false, forms: [[.65, .22, .05], [.6, .6, .5], [.14, .28, .7], [.7, .6, .1], [.25, .15, .07]].map(c => F.flyer(P, rnd, .5, c, -1.2)), move: fly(1.8, 1.3, .9, .1), sleeps: 1, // butterflies
      rule: (e, r) => r() < .12 + .6 * e.glade && [pick(r, 5), .06 + r() * .05] },
    { cell: 7, radius: 40, shadow: false, forms: [[.1, .35, .6], [.15, .5, .3], [.6, .15, .1]].map(c => F.flyer(P, rnd, .14, c, .5)), move: fly(5, 1.4, 4), sleeps: 1, // dragonflies hawk over damp ground
      rule: (e, r) => r() < sat(e.wet * 5 - 2.1) && [pick(r, 3), .09 + r() * .04] },
    { cell: 5, radius: 30, shadow: false, forms: [[.5, .48, .4], [.3, .26, .2]].map(c => F.flyer(P, rnd, .6, c, .3)), move: fly(1.2, 1.8, .7, .15), sleeps: -1, // moths come out when the butterflies go in
      rule: (e, r) => r() < .5 && [pick(r, 2), .04 + r() * .03] },
    { cell: 5, radius: 30, shadow: false, forms: [F.litter(P, rnd)], rule: (e, r) => r() < .5 * (1 - e.glade) && [0, .4 + r() * .4],
      move: (d, o, t) => { const k = (t * .7 + o.h * 40) % 14
        d.position.set(o.x + Math.sin(t + o.h * 9) * .7, o.y + 14 - k, o.z + Math.cos(t * .7 + o.h * 5) * .7)
        d.rotation.set(t * 1.3 + o.h * 6, t * .9, o.h * 6) } },
  ]

  const d = new THREE.Object3D(), tint = new THREE.Color()
  layers.forEach((L, li) => {
    const cap = Math.ceil(3.3 * (L.radius / L.cell) ** 2)
    L.step = Math.max(2, L.radius * .06) // how far the walker goes before this layer is scattered afresh
    L.meshes = L.forms.map(f => {
      f.geometry.setAttribute('reach', new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(L.radius - L.step), 1))
      const m = new THREE.InstancedMesh(f.geometry, f.mats.map(k => mats[k]), cap)
      m.frustumCulled = false; m.receiveShadow = true; m.castShadow = L.shadow !== false
      m.onBeforeShadow = () => { m.all = m.count; m.count = m.near }
      m.onAfterShadow = () => (m.count = m.all)
      scene.add(m)
      return m
    })
    L.at = (ix, iz) => { // what grows in this cell: the same answer every time it is asked
      let k = li * 64
      const r = () => hash(ix, iz, k++), x = (ix + r()) * L.cell, z = (iz + r()) * L.cell, hit = L.rule({ x, z, ...fields(x, z) }, r)
      return hit && { x, z, r, form: hit[0], s: hit[1] }
    }
    L.fill = (cx, cz) => {
      L.meshes.forEach(m => (m.count = 0)); L.live = []
      const n = Math.ceil(L.radius / L.cell), ox = Math.round(cx / L.cell), oz = Math.round(cz / L.cell)
      const hits = []
      for (let ix = ox - n; ix <= ox + n; ix++) for (let iz = oz - n; iz <= oz + n; iz++) {
        const c = L.at(ix, iz)
        if (c && (c.far = Math.hypot(c.x - cx, c.z - cz) / L.radius) <= 1) hits.push(c)
      }
      L.meshes.forEach(m => (m.near = 0))
      for (const c of hits.sort((a, b) => a.far - b.far)) { // nearest first, so the shadow pass can stop early
        const { x, z, r, far } = c, m = L.meshes[c.form], s = c.s, y = height(x, z) - (L.sink || 0) * s, t = L.tilt || 0
        d.position.set(x, y, z); d.rotation.set((r() - .5) * t, r() * 6.283, (r() - .5) * t); d.scale.set(s * (c.w = .82 + r() * .36), s * (2 - c.w), s * c.w); d.updateMatrix() // every one its own build
        if (L.move) L.live.push({ m, i: m.count, x, y, z, s, h: r() })
        m.setMatrixAt(m.count, d.matrix)
        const warm = r() < .1 ? .4 : 0 // one in ten is turning
        if (far * L.radius < 125 + L.step) m.near++ // beyond this the sun's shadow map does not reach
        m.setColorAt(m.count++, tint.setRGB(.8 + r() * .4 + warm, .8 + r() * .4, .75 + r() * .4 - warm))
      }
      L.meshes.forEach(m => { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true })
    }
  })

  // ground: one sheet that follows the walker, coloured by the same fields
  const N = 190, SIZE = 380, step = SIZE / N, g = new THREE.PlaneGeometry(SIZE, SIZE, N, N).rotateX(-Math.PI / 2)
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array((N + 1) ** 2 * 3), 3))
  const ground = new THREE.Mesh(g, mats.ground)
  ground.receiveShadow = true; ground.frustumCulled = false
  scene.add(ground)
  const lay = { step: 5, fill(cx, cz) {
    const Q = g.attributes.position, C = g.attributes.color, U = g.attributes.uv, ox = Math.round(cx / step) * step, oz = Math.round(cz / step) * step
    for (let i = 0; i < Q.count; i++) {
      const x = (i % (N + 1) - N / 2) * step + ox, z = ((i / (N + 1) | 0) - N / 2) * step + oz, e = fields(x, z), k = .75 + .5 * noise(x * .3, z * .3, 9)
      let c = mix([.36, .29, .21], [.26, .42, .1], sat(e.wet * 6 - 2.6) * sat(noise(x * .11, z * .11, 8) * 2.2 - .4))
      c = mix(mix(c, [.2, .34, .08], e.glade), [.5, .43, .33], sat(1.7 - e.path / 1.1))
      Q.setXYZ(i, x, height(x, z), z); U.setXY(i, x * .3, z * .3); C.setXYZ(i, c[0] * k, c[1] * k, c[2] * k)
    }
    g.computeVertexNormals()
    Q.needsUpdate = C.needsUpdate = U.needsUpdate = true
  } }

  const jobs = [lay, ...layers]
  let grown
  return Object.assign((x, z, t, day) => { // day: 0 at night; sleeps says who keeps which hours
    for (const j of jobs) if (!(Math.hypot(x - j.fx, z - j.fz) < j.step)) { // one refill a frame once grown, so no frame carries them all
      j.fill(j.fx = x, j.fz = z)
      if (grown) break
    }
    grown = 1
    for (const L of layers) if (L.move) {
      for (const o of L.live) { d.rotation.set(0, 0, 0); d.scale.setScalar(L.sleeps ? o.s * sat(.5 + L.sleeps * (day * 3 - 1)) : o.s); L.move(d, o, t); d.updateMatrix(); o.m.setMatrixAt(o.i, d.matrix) }
      L.meshes.forEach(m => (m.instanceMatrix.needsUpdate = true))
    }
  }, { collide(p) { // trunks are solid: ask the tree rule what stands in the neighbouring cells
    const T = layers[0], ox = Math.round(p.x / T.cell), oz = Math.round(p.z / T.cell)
    for (let ix = ox - 2; ix <= ox + 1; ix++) for (let iz = oz - 2; iz <= oz + 1; iz++) {
      const c = T.at(ix, iz), gap = c && T.forms[c.form].radius * c.s * 1.4 + .35, far = c && Math.hypot(p.x - c.x, p.z - c.z)
      if (c && far < gap) { p.x = c.x + (p.x - c.x) / far * gap; p.z = c.z + (p.z - c.z) / far * gap }
    }
  } })
}
