import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorState } from './ErrorState'

type ErrorBoundaryProps = {
  children: ReactNode
  title?: string
  text?: string
  headingLevel?: 2 | 3
  className?: string
  /** Clears the error when this changes, e.g. a new route or a new card */
  resetKey?: unknown
}

type ErrorBoundaryState = { error: Error | null; resetKey: unknown }

/** A render error below shows a friendly ErrorState (with the message under “Show details”) instead of a blank app. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  static getDerivedStateFromProps(props: ErrorBoundaryProps, state: ErrorBoundaryState): Partial<ErrorBoundaryState> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <ErrorState
        title={this.props.title}
        text={this.props.text}
        detail={error.message}
        headingLevel={this.props.headingLevel}
        className={this.props.className}
        onRetry={() => this.setState({ error: null })}
      />
    )
  }
}
