import { Component, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  name: string
  children: ReactNode
}
interface State {
  err: Error | null
}

// Per-pane error boundary so a single broken viz (typically Plotly axis-scaling
// failures on edge-case data) doesn't take down the whole wave workspace.
// Surfaces both the pane name and the error message so issues can be tracked
// to a specific data source / endpoint.
export default class PaneBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: unknown) {
    console.error(`[PaneBoundary:${this.props.name}]`, err, info)
  }

  retry = () => this.setState({ err: null })

  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-bad/40 bg-bad/5 p-4 text-center">
        <AlertTriangle size={20} className="text-bad" />
        <div className="text-xs font-semibold text-bad">{this.props.name} 렌더 실패</div>
        <pre className="max-h-24 max-w-full overflow-auto whitespace-pre-wrap break-all text-[10px] text-muted">
          {this.state.err.message}
        </pre>
        <button
          onClick={this.retry}
          className="inline-flex items-center gap-1 rounded border border-line bg-panel-2 px-2 py-1 text-[10px] hover:border-accent"
        >
          <RotateCcw size={10} /> 재시도
        </button>
      </div>
    )
  }
}
