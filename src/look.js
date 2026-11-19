// Everything about light: surfaces, sun and sky, then the air itself (mist, shafts, motes) and the lens.
import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

// SUN is whichever light is up, sun or moon; its colour carries its strength. The clock in light() moves all four.
const uTime = { value: 0 }, uDay = { value: 1 }, uWet = { value: 0 }, uMist = { value: 1 }, uSunView = { value: new THREE.Vector3() }, sat = x => Math.min(1, Math.max(0, x))
const SUN = new THREE.Vector3(), SUN_COLOR = new THREE.Color(), FOG = new THREE.Color()

// Past the shadow map's reach the sun dims to average canopy shade, so the map has no visible edge.
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace('return mix( 1.0, shadow, shadowIntensity );',
  'vec2 rim = abs( shadowCoord.xy - .5 ); shadow = mix( shadow, .3, smoothstep( .38, .5, max( rim.x, rim.y ) ) ); return mix( 1.0, shadow, shadowIntensity );')

// Nothing pops in: every instance carries its layer's reach and shrinks into the ground as the walker leaves it behind. Its shadow shrinks with it.
THREE.ShaderChunk.uv_pars_vertex += '\n#ifdef USE_INSTANCING\nattribute float reach;\n#endif'
THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace('mvPosition = instanceMatrix * mvPosition;', `mvPosition = instanceMatrix * mvPosition;
  vec3 eye = cameraPosition; // the shadow pass (the only orthographic one) sees from the sun, 220 m up its own axis from the walker: step back down it
  if (projectionMatrix[3].w > .5) eye -= 220. * vec3(viewMatrix[0].z, viewMatrix[1].z, viewMatrix[2].z);
  mvPosition.xyz = mix(instanceMatrix[3].xyz, mvPosition.xyz, clamp(5. - 5. * distance(eye.xz, instanceMatrix[3].xz) / reach, 0., 1.));`)

// ---------------------------------------------------------------- surfaces
// organic(): one patch gives a material wind, wingbeats, soft two-sided shading and light through the leaf.
function organic(m, { sway = '0.', flap = 0, glow = 0 }) {
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, { uTime, uSunView, uSunCol: { value: SUN_COLOR } })
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 wp = (instanceMatrix * vec4(position, 1.)).xyz; float sc = length(instanceMatrix[0].xyz);
      float gust = .6 + .4 * sin(uTime * .4 + wp.x * .05 + wp.z * .07);
      transformed.xz += (${sway}) * gust * (sin(uTime * 1.3 + wp.x * .3 + wp.z * .2) * .07 + sin(uTime * 3.7 + wp.x * 2.1 + wp.y * 1.7) * .025) / sc;
      transformed.y += ${flap ? 'abs(position.x) * sin(uTime * (5. + 1.2 / sc) + instanceColor.r * 60.) * .8' : '0.'};`)
    s.fragmentShader = 'uniform vec3 uSunView, uSunCol;\n' + s.fragmentShader
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'))
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunCol * pow(max(dot(normalize(-vViewPosition), uSunView), 0.), 3.) * ${glow.toFixed(2)};`)
  }
  return m
}

export function materials(renderer) {
  const load = new THREE.TextureLoader(), tex = (name, rep = 1) => {
    const t = load.load(name)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.setScalar(rep)
    t.anisotropy = renderer.capabilities.getMaxAnisotropy()
    if (name.includes('_c')) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const std = (o, name, rep) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .9, ...o,
    ...(name && { map: tex(name + '_c.webp', rep), normalMap: tex(name + '_n.webp', rep) }) })
  const two = { side: THREE.DoubleSide }
  const ground = std({ roughness: 1 }, 'ground')
  ground.onBeforeCompile = s => { // the same map at two scales hides the tile
    s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `vec3 g = texture2D(map, vMapUv).rgb; g = mix(vec3(dot(g, vec3(.4, .5, .1))), g, .65);
      diffuseColor.rgb *= g * (.45 + 9. * dot(texture2D(map, vMapUv * .13 + .4).rgb, vec3(.33))) * 3.6;`)
  }
  return {
    ground, bark: std({}, 'bark'), rock: std({ roughness: .85 }, 'rock', .4), plain: std({ roughness: .8 }),
    leaf: organic(std({ ...two, alphaTest: .45, roughness: .95 }, 'sprigs'), { sway: '1.', glow: .5 }),
    blade: organic(std({ ...two, roughness: 1 }), { sway: 'position.y * 3.', glow: .25 }),
    wing: organic(std({ ...two }), { flap: 1 }),
  }
}

// ---------------------------------------------------------------- sun, moon and sky
// Returns the clock: give it the hour, how hard it rains and where the walker stands; it sets every light and says how much day there is.
export function light(scene, renderer) {
  const sun = new THREE.DirectionalLight(0, 5.5), s = sun.shadow
  sun.color = SUN_COLOR
  s.mapSize.setScalar(4096); s.bias = -.0005; s.normalBias = .06
  Object.assign(s.camera, { left: -85, right: 85, top: 85, bottom: -85, near: 1, far: 420 })
  sun.castShadow = true
  const sky = new Sky()
  sky.scale.setScalar(1500)
  Object.assign(sky.material.uniforms, { turbidity: { value: 7 }, rayleigh: { value: 1.4 }, mieCoefficient: { value: .006 }, mieDirectionalG: { value: .86 } })
  sky.material.uniforms.sunPosition.value.set(0, .72, .7)
  const pmrem = new THREE.PMREMGenerator(renderer), box = new THREE.Scene().add(sky)
  scene.environment = pmrem.fromScene(box).texture // the sky lights the forest too
  const hemi = new THREE.HemisphereLight(0, 0x2a3018), S = sky.material.uniforms.sunPosition.value, c = new THREE.Color()
  const dots = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 1500 }, () => new THREE.Vector3().randomDirection().multiplyScalar(.45)))
  const stars = new THREE.Points(dots, new THREE.PointsMaterial({ size: 1.6 * renderer.getPixelRatio(), sizeAttenuation: false, transparent: true, depthWrite: false }))
  const moon = new THREE.Mesh(new THREE.SphereGeometry(.009), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.2, 3.6) }))
  sky.add(stars, moon)
  scene.add(sky, sun, sun.target, hemi)
  const U = sky.material.uniforms
  return Object.assign((hour, rain, x, y, z) => {
    const a = (hour - 6) / 12 * Math.PI
    S.set(Math.cos(a), .72 * Math.sin(a), .7 * Math.sin(a))                    // sunrise at six, 46 degrees up at noon
    const e = S.y, day = sat(e * 4 + .35), high = sat(e * 2.5)
    SUN.copy(S).multiplyScalar(e > 0 ? 1 : -1)                                 // the moon rides opposite the sun
    U.time.value = uTime.value * 40; U.cloudCoverage.value = .35 + .6 * rain                  // clouds drift, and close over for a shower
    uWet.value = rain; uMist.value = 2 - 1.2 * high + 2 * rain                 // mist gathers at dawn, dusk, night and in rain
    if (e > 0) SUN_COLOR.setRGB(1, .4 + .42 * high, .15 + .45 * high).multiplyScalar(sat(e * 6) * (1 - .85 * rain))
    else SUN_COLOR.setRGB(.5, .65, 1).multiplyScalar(.3 * sat(-e * 6))
    FOG.setRGB(.055, .08, .13).lerp(c.setRGB(.82 - .2 * high, .58 + .1 * high, .4 + .2 * high), day)
    hemi.color.setRGB(.25, .35, .6).lerp(c.setRGB(.95 - .22 * high, .62 + .17 * high, .4 + .24 * high), day) // warm when the sun is low
    hemi.intensity = .55 * (.4 + .6 * day) * (1 - .3 * rain)
    scene.environmentIntensity = .15 * day
    renderer.toneMappingExposure = .85 * (1.7 - .7 * day)                      // eyes open up in the dark
    stars.material.opacity = 1 - day
    moon.position.copy(S).multiplyScalar(-.45)
    sun.target.position.set(x, y, z); sun.position.copy(SUN).multiplyScalar(220).add(sun.target.position); sky.position.set(x, 0, z)
    return uDay.value = day
  }, { sun })
}

// motes: dust and pollen by day, a few fireflies by night, and rain; each one cloud of points that wraps around the walker forever
export function motes(scene) {
  const cloud = (n, vertexShader, fragmentShader) => {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).map(() => Math.random() * 40), 3))
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime, uDay, uWet }, vertexShader, fragmentShader }))
    m.frustumCulled = false
    scene.add(m)
  }
  cloud(900, `uniform float uTime, uDay; varying float a;
      void main() { vec3 q = position + vec3(sin(uTime * .2 + position.y), -uTime * .04 + sin(uTime * .3 + position.x) * .3, cos(uTime * .17 + position.z)) ;
        q = mod(q - cameraPosition, 40.) - 20.; a = smoothstep(20., 8., length(q)) * (.5 + .5 * sin(uTime * 2. + position.x * 40.)) * mix(step(.9, fract(position.x * 7.3)) * 3., 1., uDay);
        vec4 mv = viewMatrix * vec4(q + cameraPosition, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = 26. / -mv.z; }`,
    `uniform float uDay; varying float a; void main() { float d = length(gl_PointCoord - .5); gl_FragColor = vec4(mix(vec3(.6, 1., .25), vec3(1., .9, .65), uDay) * a * smoothstep(.5, .1, d) * .7, 1.); }`)
  cloud(6000, `uniform float uTime, uWet; varying float a;
      void main() { vec3 q = mod(position + vec3(uTime * 1.5, -uTime * (11. + fract(position.x * 9.) * 5.), 0.) - cameraPosition, 40.) - 20.;
        vec4 mv = viewMatrix * vec4(q + cameraPosition, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uWet > 0. ? min(450. / -mv.z, 70.) : 0.;
        a = uWet * smoothstep(20., 12., length(q)) * smoothstep(.3, 2., -mv.z); }`, // each drop is a tall sprite with a hairline down the middle
    `uniform float uDay; varying float a; void main() { gl_FragColor = vec4(vec3(.6, .7, .8) * a * smoothstep(.035, 0., abs(gl_PointCoord.x - .5 + (gl_PointCoord.y - .5) * .1)) * (.06 + .3 * uDay), 1.); }`)
}

// ---------------------------------------------------------------- air and lens
// Air marches each view ray through the sun's shadow map: lit fog becomes shafts, and a drifting
// noise layer pools as mist near the ground. Lens adds what a camera adds.
const Air = {
  uniforms: { tScene: { value: null }, tDepth: { value: null }, tShadow: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uShadow: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uSun: { value: SUN }, uSunCol: { value: SUN_COLOR }, uFog: { value: FOG }, uTime, uGround: { value: 0 }, uOpen: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `
    uniform sampler2D tScene, tDepth; uniform sampler2DShadow tShadow; uniform mat4 uInvProj, uCamWorld, uShadow;
    uniform vec3 uCam, uSun, uSunCol, uFog; uniform float uTime, uGround, uOpen, uMist, uWet; varying vec2 vUv;
    float h3(vec3 p) { p = fract(p * .3183099 + .1) * 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); vec2 e = vec2(0., 1.);
      return mix(mix(mix(h3(i), h3(i + e.yxx), f.x), mix(h3(i + e.xyx), h3(i + e.yyx), f.x), f.y),
                 mix(mix(h3(i + e.xxy), h3(i + e.yxy), f.x), mix(h3(i + e.xyy), h3(i + e.yyy), f.x), f.y), f.z); }
    void main() {
      vec4 v = uInvProj * vec4(vUv * 2. - 1., texture2D(tDepth, vUv).x * 2. - 1., 1.);
      vec3 ray = (uCamWorld * vec4(v.xyz / v.w, 0.)).xyz, dir = normalize(ray);
      float len = min(length(ray), 260.), mu = dot(dir, uSun), g = .62;
      float phase = .12 + .5 * (1. - g * g) / pow(1. + g * g - 2. * g * mu, 1.5);
      float jit = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715))) + uTime * 5.);
      float T = 1., s0 = 0.; vec3 L = vec3(0.);
      for (int i = 0; i < 30; i++) {
        float s1 = len * pow((float(i) + 1.) / 30., 1.8), s = mix(s0, s1, jit);
        vec3 p = uCam + dir * s;
        float mist = exp(-max(p.y - uGround, 0.) * .45) * smoothstep(.3, .8, n3(p * vec3(.05, .12, .05) + vec3(uTime * .03, 0., uTime * .02)) * .7 + n3(p * .21 - uTime * .04) * .3);
        vec4 sc = uShadow * vec4(p, 1.);
        vec2 rim = abs(sc.xy - .5);
        float lit = mix(texture(tShadow, vec3(sc.xy, min(sc.z - .0015, 1.))), .3, smoothstep(.38, .5, max(rim.x, rim.y)));
        float a = 1. - exp(-(.0018 + .004 * uWet + .02 * uMist * mist * (1. - .7 * uOpen)) * (s1 - s0));
        L += T * a * (uSunCol * lit * phase * 1.6 + uFog); // lit by the sun where it reaches, by the sky everywhere
        T *= 1. - a; s0 = s1;
      }
      gl_FragColor = vec4(min(texture2D(tScene, vUv).rgb, 8.) * T + L, 1.); // the sun's disc is thousands bright: unclamped, bloom flashes the frame
    }`,
}

const Lens = {
  uniforms: { tDiffuse: { value: null }, uTime, uDay },
  vertexShader: Air.vertexShader,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uDay; varying vec2 vUv;
    void main() {
      vec2 c = vUv - .5; float r = dot(c, c);
      vec3 col = vec3(texture2D(tDiffuse, vUv - c * r * .012).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv + c * r * .012).b); // fringing
      col = mix(vec3(dot(col, vec3(.3, .6, .1))), col, 1.15);
      col = mix(col, col * col * (3. - 2. * col), .4) * vec3(1.03, 1., .96);                                                        // grade
      col *= (1. - r * .9) * mix(vec3(.6, .85, 1.3), vec3(1.), uDay);                                                                                                             // vignette
      col += (fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91., vec2(12.9898, 78.233))) * 43758.5453) - .5) * .035;                // grain
      gl_FragColor = vec4(col, 1.);
    }`,
}

export function post(renderer, scene, camera, sun) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2())
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(size.x, size.y) })
  const composer = new EffectComposer(renderer), air = new ShaderPass(Air), u = air.uniforms
  composer.addPass(air)
  composer.addPass(new UnrealBloomPass(size, .3, .7, 1.1))
  composer.addPass(new OutputPass())
  const lens = new ShaderPass(Lens)
  composer.addPass(lens)
  u.tScene.value = rt.texture; u.tDepth.value = rt.depthTexture
  Object.assign(u, { uTime, uMist, uWet, uSun: { value: SUN }, uSunCol: { value: SUN_COLOR }, uFog: { value: FOG } }) // a pass copies its uniforms: share the live ones
  Object.assign(lens.uniforms, { uTime, uDay })
  return {
    resize(w, h) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h); renderer.getDrawingBufferSize(size); rt.setSize(size.x, size.y) },
    render(t, ground, open) { // open: how much of a clearing we stand in; sun burns the mist off there
      uTime.value = t
      uSunView.value.copy(SUN).transformDirection(camera.matrixWorldInverse)
      renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null)
      u.tShadow.value = sun.shadow.map.depthTexture; u.uShadow.value.copy(sun.shadow.matrix)
      u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld)
      u.uCam.value.copy(camera.position); u.uGround.value = ground; u.uOpen.value = open
      composer.render()
    },
  }
}
