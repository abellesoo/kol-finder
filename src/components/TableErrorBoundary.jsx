import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class TableErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Table render error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="px-4 py-8 border border-rose/20 rounded-xl bg-rose/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-rose" />
            <p className="text-sm font-medium text-rose">Table failed to render</p>
          </div>
          <p className="text-xs text-ink/50 font-mono">{this.state.error.message}</p>
          <p className="text-xs text-ink/30 mt-1">Check the browser console for the full stack trace.</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-3 px-3 py-1.5 text-xs border border-rose/30 text-rose rounded-lg hover:bg-rose/10 transition-colors"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
