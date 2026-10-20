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
 * The falling bills here are illustrative spends (MoneyTree's EXAMPLE_BILLS),
 * never anyone's real money: nobody is signed in on this page.
 */
export default function Landing({ onSignIn, onRegister }) {
  return (
    <div className="landing">
      <header className="landing-bar">
        <span className="wordmark landing-brand">SpendWise</span>
        <button type="button" className="btn landing-signin" data-testid="landing-sign-in"
                onClick={onSignIn}>
          Sign in
        </button>
      </header>

      <main className="landing-hero">
        <h1 className="landing-title sw-extruded">
          <span>Know where</span> <span>every rupee</span> <span>goes.</span>
        </h1>

        <div className="landing-tree">
          <MoneyTree variant="landing" atmosphere
                     alt="A bonsai tree whose leaves are banknotes, with bills drifting down from it" />
        </div>

        <div className="landing-side">
          <p className="landing-statement">
            <span>Log a spend</span> <span>in seconds.</span> <span>See it by category</span>{' '}
            <span>and by day.</span> <span>Visible to</span> <span>you alone.</span>
          </p>
          <button type="button" className="btn btn-lg landing-start" data-testid="landing-start"
                  onClick={onRegister}>
            Create your account
          </button>
        </div>
      </main>
    </div>
  )
}
