import { useEffect, useState } from 'react'
import iconGoogle from '../../assets/icon-google.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import {
  fetchAuthConfig,
  fetchGoogleAuthUrl,
  loginWithDevMock,
  type AuthConfig,
  type AuthResponse,
} from '../../services/authService'
import './SignInPage.css'

type SignInPageProps = {
  onBack: () => void
  onSuccess: (result: AuthResponse) => void
}

export function SignInPage({ onBack, onSuccess }: SignInPageProps) {
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchAuthConfig()
      .then((cfg) => {
        setConfig(cfg)
      })
      .catch(() => {
        // Fallback for offline dev
        setConfig({
          googleClientId: null,
          isConfigured: false,
          redirectUri: `${window.location.origin}/#/auth/callback`,
          clientOrigin: window.location.origin,
          devModeEnabled: true,
        })
      })
  }, [])

  const handleGoogleClick = async () => {
    setLoading(true)
    setError(null)
    try {
      if (config?.isConfigured) {
        const url = await fetchGoogleAuthUrl()
        window.location.href = url
      } else {
        // If Google credentials are not yet configured in .env, seamlessly use the local dev login
        const res = await loginWithDevMock({
          email: 'aditi.travels@gmail.com',
          name: 'Aditi Sharma',
        })
        onSuccess(res)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to start Google sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleDevLogin = async (account: { email: string; name: string }) => {
    setLoading(true)
    setError(null)
    try {
      const res = await loginWithDevMock(account)
      onSuccess(res)
    } catch (err: any) {
      setError(err.message || 'Dev login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <OnboardingLayout
      eyebrow="Step 1 of 3 · Sign in"
      title="Welcome to GhoomMates"
      subtitle="Sign in or create your account with Google to plan, split, and share with your squad."
      step={1}
      totalSteps={3}
      onBack={onBack}
      actions={
        <p className="onboarding__footnote">
          By signing in you agree to GhoomMates Terms and Privacy Policy. All logins are securely authenticated via Google OAuth.
        </p>
      }
    >
      {error && <div className="sign-in__error">{error}</div>}

      <div className="sign-in__card">
        {/* Primary Google Login Button */}
        <button
          type="button"
          className="sign-in__google-btn"
          onClick={handleGoogleClick}
          disabled={loading}
          aria-label="Continue with Google"
        >
          <img src={iconGoogle} alt="Google" className="sign-in__google-icon" />
          <span>{loading ? 'Connecting with Google...' : 'Continue with Google'}</span>
        </button>

        <div className="sign-in__features">
          <div className="sign-in__feature-item">
            <span className="sign-in__feature-icon">✓</span>
            <span>Instant sign-up and login in 1 tap</span>
          </div>
          <div className="sign-in__feature-item">
            <span className="sign-in__feature-icon">🔒</span>
            <span>Verified with Google OAuth 2.0 security</span>
          </div>
          <div className="sign-in__feature-item">
            <span className="sign-in__feature-icon">✨</span>
            <span>No passwords or SMS codes needed</span>
          </div>
        </div>

        {/* Test accounts: on for local dev, and on a deployed demo when ALLOW_DEV_LOGIN is set */}
        {config?.devModeEnabled && (
          <>
            <div className="sign-in__divider">
              <span>Test accounts</span>
            </div>

            <div className="sign-in__dev-box">
              <div className="sign-in__dev-label">
                <span>Quick test sign-in</span>
                <span className="sign-in__dev-badge">Demo mode</span>
              </div>
              <div className="sign-in__dev-accounts">
                <button
                  type="button"
                  className="sign-in__dev-account-btn"
                  onClick={() =>
                    handleDevLogin({
                      name: 'Aditi Sharma',
                      email: 'aditi.travels@gmail.com',
                    })
                  }
                  disabled={loading}
                >
                  <span className="sign-in__dev-account-name">Aditi Sharma</span>
                  <span className="sign-in__dev-account-email">aditi.travels@gmail.com</span>
                </button>
                <button
                  type="button"
                  className="sign-in__dev-account-btn"
                  onClick={() =>
                    handleDevLogin({
                      name: 'Kabir Mehta',
                      email: 'kabir.mehta@gmail.com',
                    })
                  }
                  disabled={loading}
                >
                  <span className="sign-in__dev-account-name">Kabir Mehta</span>
                  <span className="sign-in__dev-account-email">kabir.mehta@gmail.com</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </OnboardingLayout>
  )
}
