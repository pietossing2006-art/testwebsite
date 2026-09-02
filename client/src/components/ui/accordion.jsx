import { createContext, useContext, useMemo, useState } from 'react'

const AccordionContext = createContext(null)

function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

export function Accordion({ type = 'single', collapsible = false, className = '', children }) {
  const [openSingle, setOpenSingle] = useState(null)
  const [openMulti, setOpenMulti] = useState([])

  const value = useMemo(() => ({
    type,
    collapsible,
    openSingle,
    setOpenSingle,
    openMulti,
    setOpenMulti,
  }), [type, collapsible, openSingle, openMulti])

  return <AccordionContext.Provider value={value}><div className={className}>{children}</div></AccordionContext.Provider>
}

const AccordionItemContext = createContext(null)

export function AccordionItem({ value, className = '', children }) {
  return (
    <AccordionItemContext.Provider value={String(value)}>
      <div className={cn('border-b border-sky-100 last:border-b-0', className)}>{children}</div>
    </AccordionItemContext.Provider>
  )
}

export function AccordionTrigger({ className = '', children }) {
  const acc = useContext(AccordionContext)
  const itemValue = useContext(AccordionItemContext)
  if (!acc || !itemValue) return null

  const isOpen = acc.type === 'multiple'
    ? acc.openMulti.includes(itemValue)
    : acc.openSingle === itemValue

  function onToggle() {
    if (acc.type === 'multiple') {
      acc.setOpenMulti((prev) => prev.includes(itemValue) ? prev.filter((v) => v !== itemValue) : [...prev, itemValue])
      return
    }
    if (isOpen && acc.collapsible) {
      acc.setOpenSingle(null)
      return
    }
    acc.setOpenSingle(itemValue)
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={cn(
        'group flex w-full items-center justify-between gap-3 py-3.5 text-left text-sm font-bold text-slate-800 transition-colors hover:text-sky-600',
        className,
      )}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <svg
        viewBox="0 0 24 24"
        className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-hover:text-sky-600', isOpen ? 'rotate-180 text-sky-600' : '')}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </button>
  )
}

export function AccordionContent({ className = '', children }) {
  const acc = useContext(AccordionContext)
  const itemValue = useContext(AccordionItemContext)
  if (!acc || !itemValue) return null

  const isOpen = acc.type === 'multiple'
    ? acc.openMulti.includes(itemValue)
    : acc.openSingle === itemValue

  return (
    <div className={cn('grid transition-[grid-template-rows] duration-200 ease-out', isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
      <div className="overflow-hidden">
        <div className={cn('pb-3.5 text-xs sm:text-sm text-slate-600 leading-relaxed font-normal', className)}>{children}</div>
      </div>
    </div>
  )
}
