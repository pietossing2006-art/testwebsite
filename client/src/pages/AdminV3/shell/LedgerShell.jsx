import TopBar from './TopBar.jsx'
import TabNav from './TabNav.jsx'
import './ledgerx.css'

export default function LedgerShell({ topBarProps, tabNavProps, children, footer }) {
  return (
    <div className="lgx-root">
      <TopBar {...topBarProps} />
      <TabNav {...tabNavProps} />
      {children}
      {footer ? <footer className="lgx-footer">{footer}</footer> : null}
    </div>
  )
}
