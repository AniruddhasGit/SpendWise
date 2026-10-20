import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '../lib/motion.js'

/**
 * Ground mist for the landing scene (SW-ADR-159). Soft banks of fog that lurk
 * low over the glass floor and drift across the whole first screen, the words
 * included. Thin wisps ride higher up.
 *
 * Each bank is a pre-drawn puff (a cluster of soft discs on an offscreen
 * canvas), so a frame is a few dozen drawImage calls at half resolution:
 * fog has no edges worth paying full resolution for. Reduced motion draws one
 * still frame. It pauses off screen and in hidden tabs.
 *
 * `floor` is a selector for the floor element: the mist is laid ON its top
 * edge, rising around whatever stands there, so it never reads as fog under
 * the ground. Without one, `ground` (a fraction of the box's height) is used.
 */
function makePuff(colour, seed) {
  const S = 256
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const g = c.getContext('2d')
  let r = seed
  const rand = () => { r = (r * 16807) % 2147483647; return r / 2147483647 }
  for (let i = 0; i < 14; i += 1) {
    const x = S * (0.25 + rand() * 0.5)
    const y = S * (0.35 + rand() * 0.3)
    const rad = S * (0.12 + rand() * 0.2)
    const grd = g.createRadialGradient(x, y, 0, x, y, rad)
    grd.addColorStop(0, `rgb(${colour} / 0.16)`)
    grd.addColorStop(1, `rgb(${colour} / 0)`)
    g.fillStyle = grd
    g.beginPath()
    g.arc(x, y, rad, 0, Math.PI * 2)
    g.fill()
  }
  return c
}

export default function Fog({ ground: groundDefault = 0.72, floor = null, className = '' }) {
  const ref = useRef(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return undefined
    const ctx = canvas.getContext('2d')
    if (!ctx) return undefined
    const colour = getComputedStyle(canvas).getPropertyValue('--sw-dusk-fog').trim() || '220 228 220'
    const puffs = [makePuff(colour, 7), makePuff(colour, 101), makePuff(colour, 4242)]
    const SCALE = 0.5
    let W = 1; let H = 1
    let ground = groundDefault
    let banks = []
    let raf = 0; let last = 0; let running = false; let visible = true
    let pageVisible = !document.hidden
    const reduced = prefersReducedMotion()

    const seed = () => {
      const n = W < 700 ? 16 : 30
      banks = Array.from({ length: n }, (_, i) => {
        // most of the fog lies ON the floor: each bank's lower edge rests near
        // the floor's top line, so it rises around the trunk; a few lie on the
        // nearer glass, and thin wisps ride higher
        const kind = i < n * 0.6 ? 'on' : i < n * 0.8 ? 'near' : 'high'
        const w = W * (kind === 'high' ? 0.5 + Math.random() * 0.6 : 0.4 + Math.random() * 0.5)
        const h = w * (kind === 'high' ? 0.16 + Math.random() * 0.08 : 0.18 + Math.random() * 0.1)
        const y = kind === 'on' ? H * ground - h * (0.12 + Math.random() * 0.22)
          : kind === 'near' ? H * (ground + 0.03 + Math.random() * 0.1)
            : H * (0.12 + Math.random() * (ground - 0.25))
        return {
          img: puffs[i % puffs.length],
          x: Math.random() * (W + w) - w,
          y,
          w,
          h,
          vx: (6 + Math.random() * 16) * (W / 1400) * (Math.random() < 0.82 ? 1 : -0.6),
          a: kind === 'on' ? 0.45 + Math.random() * 0.45 : kind === 'near' ? 0.25 + Math.random() * 0.25
            : 0.1 + Math.random() * 0.14,
          bob: Math.random() * 6.28,
        }
      })
    }

    const measure = () => {
      const r = canvas.getBoundingClientRect()
      W = Math.max(1, r.width); H = Math.max(1, r.height)
      const el = floor && canvas.parentElement?.querySelector(floor)
      if (el) ground = Math.min(0.95, Math.max(0.3, (el.getBoundingClientRect().top - r.top) / H))
      canvas.width = Math.round(W * SCALE)
      canvas.height = Math.round(H * SCALE)
      ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0)
      seed()
    }

    const draw = (dt) => {
      ctx.clearRect(0, 0, W, H)
      for (const b of banks) {
        b.x += b.vx * dt
        b.bob += dt * 0.25
        if (b.vx > 0 && b.x > W) b.x = -b.w
        if (b.vx < 0 && b.x + b.w < 0) b.x = W
        ctx.globalAlpha = b.a * (0.8 + 0.2 * Math.sin(b.bob))
        ctx.drawImage(b.img, b.x, b.y - b.h / 2 + Math.sin(b.bob) * 6, b.w, b.h)
      }
      ctx.globalAlpha = 1
    }

    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0)
      last = now
      draw(dt)
      raf = requestAnimationFrame(frame)
    }
    const start = () => {
      if (running || reduced || !visible || !pageVisible) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => { running = false; cancelAnimationFrame(raf) }

    measure()
    draw(0)
    const ro = new ResizeObserver(() => { measure(); draw(0) })
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
    }
  }, [groundDefault, floor])

  return <canvas ref={ref} className={`fog ${className}`.trim()} aria-hidden="true" />
}
