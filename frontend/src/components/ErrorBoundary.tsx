import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: (e: Error, retry: () => void) => ReactNode
}
interface State {
  err: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: unknown) {
    console.error('ErrorBoundary caught:', err, info)
  }

  retry = () => this.setState({ err: null })

  render() {
    if (!this.state.err) return this.props.children
    if (this.props.fallback) return this.props.fallback(this.state.err, this.retry)
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="max-w-md rounded-lg border border-bad/40 bg-bad/10 p-5 text-sm">
          <div className="mb-2 font-semibold text-bad">화면 렌더링 오류</div>
          <pre className="overflow-auto whitespace-pre-wrap text-[11px] text-text/80">
            {this.state.err.message}
          </pre>
          <button
            onClick={this.retry}
            className="mt-3 rounded border border-line bg-panel-2 px-3 py-1 text-xs hover:border-accent"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }
}
