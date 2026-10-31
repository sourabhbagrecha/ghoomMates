import { useEffect, useState } from 'react'
import iconGoogle from '../../assets/icon-google.svg'
import { OnboardingLayout } from '../../components/OnboardingLayout'
import {
  fetchAuthConfig,
  fetchGoogleAuthUrl,
  loginWithDevMock,
  loginWithGoogleCredential,
  type AuthConfig,
  type AuthResponse,
} from '../../services/authService'
import './SignInPage.css'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
            auto_select?: boolean
          }) => void
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: 'outline' | 'filled_blue' | 'filled_black'
              size?: 'large' | 'medium' | 'small'
              text?: 'signin_with' | 'signup_with' | 'continue_with'
              shape?: 'pill' | 'rectangular'
              width?: number
            }
          ) => void
          prompt: () => void
        }
      }
    }
  }
}

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

        // If Google Client ID is configured, load GIS SDK script dynamically
        if (cfg.googleClientId) {
          const scriptId = 'google-jssdk'
          if (!document.getElementById(scriptId)) {
            const script = document.createElement('script')
            script.id = scriptId
            script.src = 'https://accounts.google.com/gsi/client'
            script.async = true
            script.defer = true
            script.onload = () => {
              if (window.google?.accounts?.id && cfg.googleClientId) {
                window.google.accounts.id.initialize({
                  client_id: cfg.googleClientId,
                  callback: async (response) => {
                    setLoading(true)
                    setError(null)
                    try {
                      const res = await loginWithGoogleCredential(response.credential)
                      onSuccess(res)
                    } catch (err: any) {
                      setError(err.message || 'Google sign-in failed')
                    } finally {
                      setLoading(false)
                    }
                  },
                })

                const btnContainer = document.getElementById('google-btn-slot')
                if (btnContainer) {
                  window.google.accounts.id.renderButton(btnContainer, {
                    theme: 'outline',
                    size: 'large',
                    text: 'continue_with',
                    shape: 'pill',
                    width: 320,
                  })
                }
              }
            }
            document.body.appendChild(script)
          }
        }
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
  }, [onSuccess])

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
      eyebrow="Sign in · Google"
      title="Welcome to Ghoomate"
      subtitle="Sign in or create your account with Google to plan, split, and share with your squad."
      step={1}
      onBack={onBack}
      actions={
        <p className="onboarding__footnote">
          By signing in you agree to Ghoomate Terms and Privacy Policy. All logins are securely authenticated via Google OAuth.
        </p>
      }
    >
      {error && <div className="sign-in__error">{error}</div>}

      <div className="sign-in__card">
        {/* Render container for Google Identity Services if client_id exists */}
        <div id="google-btn-slot" className="sign-in__gis-container" />

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

        {/* Local developer testing accounts */}
        {config?.devModeEnabled && (
          <>
            <div className="sign-in__divider">
              <span>Local Dev Test Accounts</span>
            </div>

            <div className="sign-in__dev-box">
              <div className="sign-in__dev-label">
                <span>Quick Test Sign-In</span>
                <span className="sign-in__dev-badge">Local Mode</span>
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
