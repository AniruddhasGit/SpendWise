import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { stored } from './theme.js'

/**
 * The signed-out scene: the landing page and the sign-in page (SW-ADR-160).
 *
 * The two pages are one world, the money tree in its fog, so they share one
 * theme and one switch, and the tree is carried from one to the other.
 */

gsap.registerPlugin(ScrollTrigger)

// ── the scene's theme ──────────────────────────────────────────────────────
// Dark unless the person chose light. "System", the app's default, means
// dark here: the owner wants the scene dark by default.
export function sceneTheme() {
  return stored() === 'light' ? 'light' : 'dark'
}

/** Paints the document in the scene's theme without saving a choice, so the
    sign-in card and its inputs use the same colours as the scene around them. */
export function paintScene(theme) {
  document.documentElement.setAttribute('data-theme', theme)
}

// ── is the server awake? ───────────────────────────────────────────────────
// On the always-on front, the API sits behind a free server that sleeps.
// `/healthz` touches no database (app/core/health.py), so asking it while the
// visitor watches the countdown costs nothing on Neon. Asked only while a
// visitor is waiting, and never again once it answers: no keep-awake ping.
const WAKE_EVERY_MS = 2500
const ASK_TIMEOUT_MS = 12000

async function awake() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS)
  try {
    const res = await fetch('/healthz', { cache: 'no-store', signal: ctrl.signal })
    // A sleeping service answers with the host's own loading page, HTML. The
    // app's health check answers 200 with no body.
    const type = res.headers.get('content-type') || ''
    return res.ok && !type.includes('text/html')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** True once the server answers. `since` is when the waiting began. */
export function useServerReady() {
  const [ready, setReady] = useState(false)
  const [since] = useState(() => Date.now())
  useEffect(() => {
    let live = true
    let timer = 0
    const ask = async () => {
      if (await awake()) { if (live) setReady(true); return }
      if (live) timer = setTimeout(ask, WAKE_EVERY_MS)
    }
    ask()
    return () => { live = false; clearTimeout(timer) }
  }, [])
  return { ready, since }
}

// ── carrying the tree between the pages ────────────────────────────────────
// The browser's own View Transitions: the tree and the fog are named in CSS
// (`sw-tree`, `sw-fog`), so the browser morphs them from where they stood on
// the old page to where they stand on the new one. Everything else is handled
// by the pages' own exit and entrance animations.
export function carryAcross(update) {
  if (!document.startViewTransition) { update(); return Promise.resolve() }
  const vt = document.startViewTransition(() => flushSync(update))
  return vt.finished.catch(() => {})
}

// ── smooth scroll, everywhere ──────────────────────────────────────────────
// Lenis on GSAP's ticker, so ScrollTrigger and the scroll share one loop.
let lenis = null
export function startSmoothScroll() {
  if (lenis) return lenis
  lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1, smoothWheel: true })
  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  gsap.ticker.lagSmoothing(0)
  return lenis
}

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true })
  else window.scrollTo(0, 0)
}
