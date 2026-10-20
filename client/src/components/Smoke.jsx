import { useEffect, useRef, useState } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'
import Fog from './Fog.jsx'

/**
 * Simulated ground smoke for the landing scene (SW-ADR-159, revised by the
 * owner 2026-10-20: "simulation clouds which can react to the mouse", animated
 * smoke rather than painted clouds).
 *
 * A real-time fluid: the stable-fluids method (Stam 1999) in the form Pavel
 * Dobryakov's WebGL fluid made familiar. Velocity is advected, vorticity
 * confinement curls it into billows, a pressure solve keeps it incompressible,
 * and a density field (the smoke) rides on it. Emitters along the floor line
 * keep pouring smoke in; it drifts, rises a little, and is wiped out above the
 * lowest branches so the crown and the sky stay clear. A pointer moving over
 * the scene stirs the velocity field, so the smoke swirls away from it.
 *
 * WebGL2 with float render targets, no library (the stack is locked:
 * SW-ADR-016). Without that, or under reduced motion, the painted `Fog` is
 * drawn instead. It pauses off screen and in hidden tabs.
 */

const VERT = `#version 300 es
in vec2 aPos;
uniform vec2 texel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texel.x, 0.0); vR = vUv + vec2(texel.x, 0.0);
  vT = vUv + vec2(0.0, texel.y); vB = vUv - vec2(0.0, texel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const HEAD = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;
out vec4 o;
`

const FRAG = {
  splat: `${HEAD}
uniform sampler2D target; uniform float aspect; uniform vec3 value;
uniform vec2 point; uniform float radius;
void main() {
  vec2 p = vUv - point; p.x *= aspect;
  o = vec4(texture(target, vUv).xyz + exp(-dot(p, p) / radius) * value, 1.0);
}`,
  // every source on the floor in one pass: xy position, z dye, w (as vel) push
  emit: `${HEAD}
uniform sampler2D target; uniform float aspect; uniform float radius;
uniform vec4 src[9]; uniform vec2 push[9]; uniform float isDye;
void main() {
  vec4 base = texture(target, vUv);
  vec2 add = vec2(0.0);
  for (int i = 0; i < 9; i++) {
    vec2 p = vUv - src[i].xy; p.x *= aspect;
    float g = exp(-dot(p, p) / radius);
    add += g * (isDye > 0.5 ? vec2(src[i].z, 0.0) : push[i]);
  }
  o = vec4(base.xy + add, base.z, 1.0);
}`,
  advect: `${HEAD}
uniform sampler2D velocity; uniform sampler2D source; uniform vec2 simTexel;
uniform float dt; uniform float dissipation; uniform float ceilY; uniform float ceilBand;
uniform float ceilRate; uniform float floorY;
void main() {
  vec2 coord = vUv - dt * texture(velocity, vUv).xy * simTexel;
  // wiped above the lowest branches and below the near edge of the floor
  float d = dissipation + ceilRate * smoothstep(ceilY - ceilBand, ceilY + ceilBand, vUv.y)
          + ceilRate * (1.0 - smoothstep(floorY - ceilBand, floorY + ceilBand, vUv.y))
          // and thinned at the side walls, where it would otherwise pile up
          + 0.5 * ceilRate * (1.0 - smoothstep(0.0, 0.06, min(vUv.x, 1.0 - vUv.x)));
  // nothing flows in from beyond the edges (a clamped edge texel would keep
  // feeding smoke back into the frame)
  float inside = step(0.0, coord.x) * step(coord.x, 1.0) * step(0.0, coord.y) * step(coord.y, 1.0);
  o = inside * texture(source, coord) / (1.0 + d * dt);
}`,
  forces: `${HEAD}
uniform sampler2D velocity; uniform sampler2D dye; uniform float dt;
uniform float buoyancy; uniform float wind;
void main() {
  vec2 v = texture(velocity, vUv).xy;
  float d = texture(dye, vUv).r;
  v += dt * vec2(wind * min(d, 1.0), buoyancy * min(d, 1.5));
  o = vec4(v, 0.0, 1.0);
}`,
  curl: `${HEAD}
uniform sampler2D velocity;
void main() {
  float L = texture(velocity, vL).y; float R = texture(velocity, vR).y;
  float T = texture(velocity, vT).x; float B = texture(velocity, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`,
  vorticity: `${HEAD}
uniform sampler2D velocity; uniform sampler2D curl; uniform float strength; uniform float dt;
void main() {
  float L = texture(curl, vL).x; float R = texture(curl, vR).x;
  float T = texture(curl, vT).x; float B = texture(curl, vB).x;
  float C = texture(curl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 0.0001;
  f *= strength * C; f.y *= -1.0;
  vec2 v = texture(velocity, vUv).xy + f * dt;
  o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`,
  divergence: `${HEAD}
uniform sampler2D velocity;
void main() {
  float L = texture(velocity, vL).x; float R = texture(velocity, vR).x;
  float T = texture(velocity, vT).y; float B = texture(velocity, vB).y;
  vec2 C = texture(velocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`,
  clear: `${HEAD}
uniform sampler2D tex; uniform float value;
void main() { o = value * texture(tex, vUv); }`,
  pressure: `${HEAD}
uniform sampler2D pressure; uniform sampler2D divergence;
void main() {
  float L = texture(pressure, vL).x; float R = texture(pressure, vR).x;
  float T = texture(pressure, vT).x; float B = texture(pressure, vB).x;
  float div = texture(divergence, vUv).x;
  o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`,
  gradient: `${HEAD}
uniform sampler2D pressure; uniform sampler2D velocity;
void main() {
  float L = texture(pressure, vL).x; float R = texture(pressure, vR).x;
  float T = texture(pressure, vT).x; float B = texture(pressure, vB).x;
  vec2 v = texture(velocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`,
  // the smoke, lit from above: where the density rises downward the surface
  // faces up and catches the light; underneath it falls into shadow
  display: `${HEAD}
uniform sampler2D dye; uniform vec3 fog; uniform vec2 dyeTexel; uniform float trunkX;
uniform float aspect;
void main() {
  float d = texture(dye, vUv).r;
  float up = texture(dye, vUv + vec2(0.0, 5.0 * dyeTexel.y)).r;
  float dn = texture(dye, vUv - vec2(0.0, 5.0 * dyeTexel.y)).r;
  float shade = clamp(0.5 + (dn - up) * 1.6, 0.0, 1.0);
  shade = mix(shade, 1.0, 0.15) * (0.75 + 0.25 * smoothstep(0.0, 0.6, d));
  float a = 1.0 - exp(-d * 1.5);
  // thinner in front of the trunk, so the tree stays readable
  a *= mix(0.55, 1.0, smoothstep(0.0, 0.16, abs(vUv.x - trunkX) * aspect));
  a = min(a, 0.92);
  vec3 c = fog * (0.3 + 0.7 * shade);
  o = vec4(c * a, a);
}`,
}

function compile(gl, type, src) {
  const s = gl.createShader(type)
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader')
  return s
}

function program(gl, vs, fragSrc) {
  const p = gl.createProgram()
  gl.attachShader(p, vs)
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fragSrc))
  gl.bindAttribLocation(p, 0, 'aPos')
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link')
  const u = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i += 1) {
    const { name } = gl.getActiveUniform(p, i)
    u[name] = gl.getUniformLocation(p, name)
  }
  return { p, u }
}

function target(gl, w, h) {
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
  const fbo = gl.createFramebuffer()
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo')
  gl.viewport(0, 0, w, h)
  gl.clearColor(0, 0, 0, 1)
  gl.clear(gl.COLOR_BUFFER_BIT)
  return { tex, fbo, w, h }
}

function double(gl, w, h) {
  let a = target(gl, w, h); let b = target(gl, w, h)
  return {
    w, h,
    get read() { return a },
    get write() { return b },
    swap() { const t = a; a = b; b = t },
  }
}

/** Starts the simulation on `canvas`; returns a stop function, or throws. */
function startSmoke(canvas, { floor, stage }) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false })
  if (!gl) throw new Error('no webgl2')
  if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('no float targets')

  const vs = compile(gl, gl.VERTEX_SHADER, VERT)
  const P = Object.fromEntries(Object.entries(FRAG).map(([k, src]) => [k, program(gl, vs, src)]))
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)

  const fog = (getComputedStyle(canvas).getPropertyValue('--sw-dusk-fog').trim() || '220 228 220')
    .split(/\s+/).map((v) => Number(v) / 255)

  let W = 1; let H = 1; let aspect = 1
  let ground = 0.72; let reach = 0.18 // as fractions of the canvas height, from the top
  let vel; let dye; let pressure; let div; let curlT
  let trunkX = 0.5
  let made = []
  let lastSize = ''

  const measure = () => {
    const r = canvas.getBoundingClientRect()
    const size = `${Math.round(r.width)}x${Math.round(r.height)}`
    if (size === lastSize) return false
    lastSize = size
    W = Math.max(1, r.width); H = Math.max(1, r.height); aspect = W / H
    const root = canvas.parentElement
    const fl = floor && root?.querySelector(floor)
    if (fl) ground = Math.min(0.95, Math.max(0.3, (fl.getBoundingClientRect().top - r.top) / H))
    const st = stage && root?.querySelector(stage)
    if (st) {
      const sr = st.getBoundingClientRect()
      reach = Math.max(0.06, (ground - (sr.top - r.top) / H) * 0.34)
      trunkX = (sr.left + sr.width / 2 - r.left) / W
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(W * dpr * 0.6)
    canvas.height = Math.round(H * dpr * 0.6)
    // resolution follows the LONG side: on a tall phone the smoke lives in a
    // thin band, and a grid sized by the short side leaves it too few cells to
    // curl
    const phone = W < 700
    const simLong = phone ? 192 : 208
    const dyeLong = phone ? 560 : 720
    const simW = aspect >= 1 ? simLong : Math.round(simLong * aspect)
    const simH = aspect >= 1 ? Math.round(simLong / aspect) : simLong
    const dyeW = aspect >= 1 ? dyeLong : Math.round(dyeLong * aspect)
    const dyeH = aspect >= 1 ? Math.round(dyeLong / aspect) : dyeLong
    for (const m of made) { gl.deleteTexture(m.tex); gl.deleteFramebuffer(m.fbo) }
    made = []
    vel = double(gl, simW, simH)
    dye = double(gl, dyeW, dyeH)
    pressure = double(gl, simW, simH)
    div = target(gl, simW, simH)
    curlT = target(gl, simW, simH)
    made = [vel.read, vel.write, dye.read, dye.write, pressure.read, pressure.write, div, curlT]
    return true
  }

  const run = (prog, out, set) => {
    gl.useProgram(prog.p)
    if (prog.u.texel) gl.uniform2f(prog.u.texel, 1 / (out ? out.w : canvas.width), 1 / (out ? out.h : canvas.height))
    let unit = 0
    const bind = (name, tex) => {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.uniform1i(prog.u[name], unit)
      unit += 1
    }
    set(bind, prog.u)
    if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fbo); gl.viewport(0, 0, out.w, out.h) } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height)
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  const splat = (field, x, y, value, radius) => {
    run(P.splat, field.write, (bind, u) => {
      bind('target', field.read.tex)
      gl.uniform1f(u.aspect, aspect)
      gl.uniform3f(u.value, value[0], value[1], value[2])
      gl.uniform2f(u.point, x, y)
      gl.uniform1f(u.radius, radius)
    })
    field.swap()
  }

  const src = new Float32Array(36)
  const push = new Float32Array(18)
  const emit = (field, isDye) => {
    run(P.emit, field.write, (bind, u) => {
      bind('target', field.read.tex)
      gl.uniform1f(u.aspect, aspect)
      gl.uniform1f(u.radius, 0.003)
      gl.uniform4fv(u['src[0]'], src)
      gl.uniform2fv(u['push[0]'], push)
      gl.uniform1f(u.isDye, isDye)
    })
    field.swap()
  }

  // the pointer: its motion becomes a push on the velocity field
  let pointer = null
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = 1 - (e.clientY - r.top) / r.height
    if (pointer && x >= -0.05 && x <= 1.05 && y >= -0.05 && y <= 1.05) {
      pointer.dx += x - pointer.x
      pointer.dy += y - pointer.y
    }
    pointer = { x, y, dx: pointer?.dx || 0, dy: pointer?.dy || 0 }
  }
  window.addEventListener('pointermove', onMove, { passive: true })

  let t = 0
  const step = (dt) => {
    t += dt
    const groundUv = 1 - ground
    const ceilUv = 1 - (ground - reach)
    const floorUv = 1 - Math.min(0.98, ground + reach * 0.7)

    // smoke keeps pouring out along the floor, each source breathing in and
    // out at its own pace so the bank heaps and thins as it rolls
    const N = 9
    for (let i = 0; i < N; i += 1) {
      // kept off the side walls, where still air would let smoke pile up
      const margin = aspect < 1 ? 0.16 : 0.05
      const x = margin + (1 - 2 * margin) * ((i + 0.5) / N) + 0.03 * Math.sin(t * 0.23 + i * 2.1)
      const pulse = 0.5 + 0.5 * Math.sin(t * (0.5 + 0.13 * i) + i * 1.7)
      const near = Math.abs(x - trunkX) < 0.08 ? 0.6 : 1
      src[i * 4] = x
      src[i * 4 + 1] = groundUv + 0.015 + 0.02 * Math.sin(t * 0.4 + i)
      src[i * 4 + 2] = 1.8 * dt * pulse * near
      push[i * 2] = Math.sin(t * 0.7 + i * 2.3) * 10
      push[i * 2 + 1] = 3 + 6 * pulse
    }
    emit(dye, 1)
    emit(vel, 0)
    if (pointer && (pointer.dx || pointer.dy)) {
      splat(vel, pointer.x, pointer.y, [pointer.dx * 5200, pointer.dy * 5200, 0], 0.0035)
      pointer.dx = 0; pointer.dy = 0
    }

    run(P.forces, vel.write, (bind, u) => {
      bind('velocity', vel.read.tex); bind('dye', dye.read.tex)
      gl.uniform1f(u.dt, dt); gl.uniform1f(u.buoyancy, 4); gl.uniform1f(u.wind, 5)
    })
    vel.swap()
    run(P.curl, curlT, (bind) => bind('velocity', vel.read.tex))
    run(P.vorticity, vel.write, (bind, u) => {
      bind('velocity', vel.read.tex); bind('curl', curlT.tex)
      gl.uniform1f(u.strength, 11); gl.uniform1f(u.dt, dt)
    })
    vel.swap()
    run(P.divergence, div, (bind) => bind('velocity', vel.read.tex))
    run(P.clear, pressure.write, (bind, u) => { bind('tex', pressure.read.tex); gl.uniform1f(u.value, 0.8) })
    pressure.swap()
    for (let i = 0; i < 16; i += 1) {
      run(P.pressure, pressure.write, (bind) => { bind('pressure', pressure.read.tex); bind('divergence', div.tex) })
      pressure.swap()
    }
    run(P.gradient, vel.write, (bind) => { bind('pressure', pressure.read.tex); bind('velocity', vel.read.tex) })
    vel.swap()
    run(P.advect, vel.write, (bind, u) => {
      bind('velocity', vel.read.tex); bind('source', vel.read.tex)
      gl.uniform2f(u.simTexel, 1 / vel.w, 1 / vel.h)
      gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, 0.25)
      gl.uniform1f(u.ceilY, ceilUv); gl.uniform1f(u.ceilBand, 0.04); gl.uniform1f(u.ceilRate, 4)
      gl.uniform1f(u.floorY, floorUv)
    })
    vel.swap()
    run(P.advect, dye.write, (bind, u) => {
      bind('velocity', vel.read.tex); bind('source', dye.read.tex)
      gl.uniform2f(u.simTexel, 1 / vel.w, 1 / vel.h)
      gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, 0.32)
      // above the lowest branches the smoke is wiped out: the crown stays clear
      gl.uniform1f(u.ceilY, ceilUv); gl.uniform1f(u.ceilBand, 0.05); gl.uniform1f(u.ceilRate, 9)
      gl.uniform1f(u.floorY, floorUv)
    })
    dye.swap()
  }

  const render = () => {
    run(P.display, null, (bind, u) => {
      bind('dye', dye.read.tex)
      gl.uniform3f(u.fog, fog[0], fog[1], fog[2])
      gl.uniform2f(u.dyeTexel, 1 / dye.w, 1 / dye.h)
      gl.uniform1f(u.trunkX, trunkX)
      gl.uniform1f(u.aspect, aspect)
    })
  }

  let raf = 0; let last = 0; let running = false; let visible = true; let pageVisible = !document.hidden
  const frame = (now) => {
    const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000 || 1 / 60))
    last = now
    step(dt)
    render()
    raf = requestAnimationFrame(frame)
  }
  const start = () => {
    if (running || !visible || !pageVisible) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }
  const stop = () => { running = false; cancelAnimationFrame(raf) }

  measure()
  // let the bank build before it is first seen
  for (let i = 0; i < 150; i += 1) step(1 / 30)
  render()

  const ro = new ResizeObserver(() => {
    if (!measure()) return
    for (let i = 0; i < 90; i += 1) step(1 / 30)
    render()
  })
  ro.observe(canvas)
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) start(); else stop() })
  io.observe(canvas)
  const onVis = () => { pageVisible = !document.hidden; if (pageVisible) start(); else stop() }
  document.addEventListener('visibilitychange', onVis)
  start()

  return () => {
    stop()
    ro.disconnect()
    io.disconnect()
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pointermove', onMove)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

export default function Smoke({ floor = null, stage = null, className = '' }) {
  const ref = useRef(null)
  const [fallback, setFallback] = useState(() => prefersReducedMotion())

  useEffect(() => {
    if (fallback || !ref.current) return undefined
    try {
      return startSmoke(ref.current, { floor, stage })
    } catch {
      setFallback(true)
      return undefined
    }
  }, [fallback, floor, stage])

  if (fallback) {
    return (
      <>
        <Fog className={`${className} landing-fog-back`.trim()} layer="back" floor={floor} stage={stage} />
        <Fog className={className} floor={floor} stage={stage} />
      </>
    )
  }
  return <canvas ref={ref} className={`smoke ${className}`.trim()} aria-hidden="true" />
}
