// Boot, walk, loop. A day lasts six minutes and starts at a random hour; showers pass now and then (?hour=22&rain=1 pins both). Drift along the footpath until the walker takes over; mouse, keys or touch.
import * as THREE from 'three'
import { setSeed, mulberry, noise, sat } from './noise.js'
import { primitives } from './forms.js'
import { populate, height, trail, fields } from './world.js'
import { materials, light, motes, post } from './look.js'

const ask = new URLSearchParams(location.search), seed = +(ask.get('seed') ?? 1), hour = ask.get('hour'), rain = ask.get('rain'), start = Math.random() * 24, touch = matchMedia('(pointer: coarse)').matches
setSeed(seed)

const renderer = new THREE.WebGLRenderer({ powerPreference: 'high-performance' }), el = renderer.domElement
let ratio = Math.min(devicePixelRatio, touch ? 1.25 : 1.5)
renderer.setPixelRatio(ratio)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.toneMapping = THREE.AgXToneMapping
renderer.toneMappingExposure = .85
document.body.append(el)

const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .15, 3000)
const sky = light(scene, renderer)
const world = populate(scene, await primitives(), materials(renderer), mulberry(seed))
motes(scene)
const lens = post(renderer, scene, camera, sky.sun)
const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); lens.resize(innerWidth, innerHeight) }
onresize = resize

// ---------------------------------------------------------------- the walker
const hint = document.getElementById('hint'), keys = {}, stick = { x: 0, y: 0 }, fingers = {}, aim = new THREE.Euler(0, 0, 0, 'YXZ')
let active = -1e9 // time of the last touch; the drift resumes after a quiet spell
hint.textContent = `SEED ${seed} · ` + (touch ? 'DRAG LEFT SIDE TO WALK · RIGHT SIDE TO LOOK · THREE-FINGER TAP FOR A NEW WOOD' : 'CLICK TO WALK · WASD · SHIFT RUN · R NEW WOOD')
setTimeout(() => (hint.style.opacity = 0), 9000)
const reseed = () => (location.search = '?seed=' + (Math.random() * 1e5 | 0))
const turn = (dx, dy, k) => { aim.y -= dx * k; aim.x = Math.max(-1.4, Math.min(1.4, aim.x - dy * k)) }
const take = () => aim.setFromQuaternion(camera.quaternion, 'YXZ') // pick up wherever the drift was looking

el.onclick = () => touch || el.requestPointerLock()
document.onpointerlockchange = take
document.onmousemove = e => document.pointerLockElement == el && turn(e.movementX, e.movementY, .0022)
onkeydown = e => { keys[e.code] = 1; if (e.code == 'KeyR') reseed() }
onkeyup = e => (keys[e.code] = 0)
el.addEventListener('touchstart', e => {
  e.preventDefault()
  if (e.touches.length == 3) return reseed()
  if (performance.now() - active > 12000) take()
  for (const t of e.changedTouches) fingers[t.identifier] = { x: t.clientX, y: t.clientY, walk: t.clientX < innerWidth / 2 }
}, { passive: false })
el.addEventListener('touchmove', e => {
  e.preventDefault()
  active = performance.now()
  for (const t of e.changedTouches) {
    const f = fingers[t.identifier]
    if (!f) continue
    if (f.walk) { stick.x = Math.max(-1, Math.min(1, (t.clientX - f.x) / 60)); stick.y = Math.max(-1, Math.min(1, (t.clientY - f.y) / 60)) }
    else { turn(t.clientX - f.x, t.clientY - f.y, .005); f.x = t.clientX; f.y = t.clientY }
  }
}, { passive: false })
const lift = e => { for (const t of e.changedTouches) { if (fingers[t.identifier]?.walk) stick.x = stick.y = 0; delete fingers[t.identifier] } }
el.addEventListener('touchend', lift)
el.addEventListener('touchcancel', lift)

// ---------------------------------------------------------------- the loop
const pos = camera.position.set(trail(0), 0, 0), look = new THREE.Vector3()
let last = 0, frames = 0, since = 0
renderer.setAnimationLoop(now => {
  const t = now / 1000, dt = Math.min(t - last, .1)
  last = t
  if (document.pointerLockElement == el || now - active < 12000) {
    const v = (keys.ShiftLeft ? 7 : 2.4) * dt, f = (keys.KeyW || 0) - (keys.KeyS || 0) - stick.y, r = (keys.KeyD || 0) - (keys.KeyA || 0) + stick.x
    camera.quaternion.setFromEuler(aim)
    pos.x += (-Math.sin(aim.y) * f + Math.cos(aim.y) * r) * v
    pos.z += (-Math.cos(aim.y) * f - Math.sin(aim.y) * r) * v
    world.collide(pos)
  } else {
    pos.z -= 1.1 * dt
    pos.x += (trail(pos.z) - pos.x) * Math.min(1, dt)
    pos.y = height(pos.x, pos.z) + 1.7
    const z = pos.z - 12, x = trail(z) + Math.sin(t * .13) * 3
    camera.lookAt(look.lerp(new THREE.Vector3(x, height(x, z) + 2.4 + Math.sin(t * .21) * 1.5, z), look.lengthSq() ? dt * .6 : 1))
  }
  const ground = height(pos.x, pos.z)
  pos.y = ground + 1.7
  world(pos.x, pos.z, t, sky(+(hour ?? start + t / 15) % 24, +(rain ?? sat(noise(t * .012 + start, 0, 20) * 5 - 3.2)), pos.x, ground, pos.z))
  // hold the frame rate: shed resolution when a second runs slow (after the first few, which include growing).
  // Resizing wipes the canvas, so it happens before the frame is drawn, never after.
  if (++frames, t - since > 1) {
    if (t > 5 && frames / (t - since) < 42 && ratio > .6) { renderer.setPixelRatio(ratio = Math.max(.6, ratio - .15)); resize() }
    frames = 0; since = t
  }
  lens.render(t, ground, fields(pos.x, pos.z).glade)
})
