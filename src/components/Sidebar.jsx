import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  const itemClass = ({ isActive }) =>
    [
      'block rounded-sm px-2 py-1',
      isActive ? 'bg-slate-200 text-slate-900' : 'text-slate-700 hover:bg-slate-200/70',
    ].join(' ')

  return (
    <aside className="border border-slate-300 bg-slate-100">
      <div className="bg-slate-300 px-3 py-2 text-[12px] font-semibold text-slate-800">Project Info</div>
      <nav className="p-2 text-[12px]">
        <NavLink to="/overview" className={itemClass}>
          Overview
        </NavLink>
        <NavLink to="/study-area" className={itemClass}>
          Study Area
        </NavLink>
        <NavLink to="/distribution-maps" className={itemClass}>
          Distribution Maps
        </NavLink>
        <NavLink to="/migration-patterns" className={itemClass}>
          Migration Patterns
        </NavLink>
        <NavLink to="/charts-data" className={itemClass}>
          Charts &amp; Data
        </NavLink>
        <NavLink to="/downloads" className={itemClass}>
          Downloads
        </NavLink>
      </nav>
    </aside>
  )
}
