import { useEffect, useRef } from 'react'
import Fog from '../components/Fog.jsx'
import MoneyTree from '../components/MoneyTree.jsx'

/**
 * The front door (SW-ADR-156, the scene from SW-ADR-159): what a signed-out
 * visitor sees first.
 *
 * An overcast dusk. The money tree stands at the centre on a glass floor seen
 * from a raised camera, its roots blurred under the glass and its trunk caught
 * faintly in the floor's reflection. Mist lurks on the floor and drifts across
 * the whole first screen, words included. Very little text sits beside the
 * tree. The headline is on the left and one line plus the action on the right.
 * Further down, the details arrive as they are scrolled into view.
 *
 * The first screen arrives the way the owner's reference reel does: each
 * piece sharpens into focus in reading order (`.sw-focus`, ordered by
 * `--sw-i`). The falling bills are illustrative spends (MoneyTree's
 * EXAMPLE_BILLS), never anyone's real money: nobody is signed in here.
 */
const at = (i) => ({ '--sw-i': i })
const TREE_SRC = '/assets/tree/money-tree.webp'

const DETAILS = [
  ['Log it in seconds.', 'An amount, a date, a category if you like. Done before the coffee cools.'],
  ['See where it went.', 'By category, by day, by weekday, and against last month, as soon as you look.'],
  ['Yours alone.', 'Every row is locked to your account in the database itself. Not even an administrator can see your amounts.'],
  ['Exact to the cent.', 'Money is kept as whole cents, never as rounded decimals, so every total adds up.'],
]

/** Adds `is-in` to each `.landing-reveal` the first time it scrolls into view. */
function useReveal(root) {
  useEffect(() => {
    const els = root.current ? [...root.current.querySelectorAll('.landing-reveal')] : []
    if (!('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('is-in'))
      return undefined
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
      }
    }, { rootMargin: '0px 0px -12% 0px' })
    els.forEach((e) => io.observe(e))
    return () => io.disconnect()
  }, [root])
}

export default function Landing({ onSignIn, onRegister }) {
  const rootRef = useRef(null)
  useReveal(rootRef)

  return (
    <div className="landing" ref={rootRef}>
      <header className="landing-bar">
        <span className="wordmark landing-brand sw-focus" style={at(0)}>SpendWise</span>
        <button type="button" className="btn landing-signin sw-focus" style={at(1)}
                data-testid="landing-sign-in" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <main>
        <section className="landing-scene" aria-labelledby="landing-title">
          <h1 className="landing-title sw-extruded" id="landing-title">
            <span className="sw-focus" style={at(3)}>Know where</span>{' '}
            <span className="sw-focus" style={at(4)}>every dollar</span>{' '}
            <span className="sw-focus" style={at(5)}>goes.</span>
          </h1>

          <div className="landing-stage sw-focus" style={at(2)}>
            {/* the glass floor, seen from a raised camera: a slab with a lit
                rim and a front edge, the tree's reflection inside it */}
            <div className="landing-floor" aria-hidden="true">
              <div className="landing-floor-glass">
                <img className="landing-reflection" src={TREE_SRC} alt="" decoding="async" />
              </div>
            </div>
            <MoneyTree variant="landing" atmosphere orbits={false} mist={false} dust ground={false}
                       alt="A bonsai tree whose leaves are banknotes, standing on a glass floor in mist, with bills drifting down from it" />
          </div>

          <div className="landing-side">
            <p className="landing-line sw-focus" style={at(6)}>
              Log a spend in seconds. Visible to you alone.
            </p>
            <button type="button" className="btn btn-lg landing-start sw-focus" style={at(7)}
                    data-testid="landing-start" onClick={onRegister}>
              Create your account
            </button>
          </div>

          <Fog className="landing-fog landing-fog-back" layer="back"
               floor=".landing-floor" stage=".landing-stage" />
          <Fog className="landing-fog" floor=".landing-floor" stage=".landing-stage" />
          <span className="landing-cue sw-focus" style={at(8)} aria-hidden="true">Scroll</span>
        </section>

        <section className="landing-details" aria-label="What it does">
          {DETAILS.map(([title, body], i) => (
            <article key={title} className="landing-detail landing-reveal" style={at(i)}>
              <span className="landing-detail-n" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
              <h2 className="landing-detail-title">{title}</h2>
              <p className="landing-detail-body">{body}</p>
            </article>
          ))}
        </section>

        <section className="landing-final landing-reveal" aria-labelledby="landing-final-title">
          <h2 className="landing-final-title sw-extruded" id="landing-final-title">
            Start with one expense.
          </h2>
          <div className="landing-final-actions">
            <button type="button" className="btn btn-lg" onClick={onRegister}>Create your account</button>
            <button type="button" className="btn btn-quiet btn-lg landing-final-signin" onClick={onSignIn}>
              Sign in
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}
