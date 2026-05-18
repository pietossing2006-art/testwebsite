import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (this.state?.error) {
      return (
        <div style={{ padding: 16, color: 'white', fontFamily: 'ui-sans-serif, system-ui' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>App crashed</div>
          <div style={{ marginTop: 8, opacity: 0.75, fontSize: 12 }}>{String(this.state.error?.message ?? this.state.error)}</div>
        </div>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
