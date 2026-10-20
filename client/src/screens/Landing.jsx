import { Fragment } from 'react'
import MoneyTree from '../components/MoneyTree.jsx'

/**
 * The front door (SW-ADR-156): what a signed-out visitor sees first.
 *
 * Composed like the owner's "Change of Perspective" poster: the headline in
 * extruded emerald block letters on the left, the money tree centre stage in
 * its atmosphere (breeze, ground mist, orbit lines), and a vermilion statement
 * stacked on the right. One action per intent: "Sign in" top right for people
 * who have an account, "Create your account" for people who do not.
 *
 * The page arrives as the owner's reference reel does: every piece starts
 * out of focus and sharpens into place in reading order (`.sw-focus`, ordered
 * by `--sw-i`): the bar, then the headline word group by word group, the tree,
 * the statement, the action.
 *
 * The falling bills here are illustrative spends (MoneyTree's EXAMPLE_BILLS),
 * never anyone's real money: nobody is signed in on this page.
 */
const at = (i) => ({ '--sw-i': i })

export default function Landing({ onSignIn, onRegister }) {
  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="wordmark landing-brand sw-focus" style={at(0)}>SpendWise</span>
        <button type="button" className="btn landing-signin sw-focus" style={at(1)}
                data-testid="landing-sign-in" onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <main className="landing-hero">
        <h1 className="landing-title sw-extruded">
          <span className="sw-focus" style={at(2)}>Know where</span>{' '}
          <span className="sw-focus" style={at(3)}>every dollar</span>{' '}
          <span className="sw-focus" style={at(4)}>goes.</span>
        </h1>

        <div className="landing-tree sw-focus" style={at(3)}>
          <MoneyTree variant="landing" atmosphere
                     alt="A bonsai tree whose leaves are banknotes, with bills drifting down from it" />
        </div>

        <div className="landing-side">
          <p className="landing-statement">
            {['Log a spend', 'in seconds.', 'See it by category', 'and by day.', 'Visible to', 'you alone.']
              .map((line, i) => (
                <Fragment key={line}>
                  {i > 0 && ' '}
                  <span className="sw-focus" style={at(5 + i)}>{line}</span>
                </Fragment>
              ))}
          </p>
          <button type="button" className="btn btn-lg landing-start sw-focus" style={at(11)}
                  data-testid="landing-start"
                  onClick={onRegister}>
            Create your account
          </button>
        </div>
      </main>
    </div>
  )
}
