export default function Navbar() {
  return (
    <header className="sticky top-0 z-[1000] w-full border-b border-sky-950/50 bg-gradient-to-b from-sky-800 to-sky-950">
      <div className="flex w-full items-center justify-between gap-4 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-6 w-6 items-center justify-center rounded bg-white/15 text-[11px] font-semibold text-white">
            S
          </div>
          <div className="text-[13px] font-semibold text-white">
            SAPYAW:
            <span className="ml-1 font-medium text-white/90">Bulan Sea Tuna Monitoring System</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/90 hover:bg-white/15"
            aria-label="Icon 1"
          >
            <span className="text-[11px]">i</span>
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/90 hover:bg-white/15"
            aria-label="Icon 2"
          >
            <span className="text-[11px]">⏻</span>
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/90 hover:bg-white/15"
            aria-label="Icon 3"
          >
            <span className="text-[11px]">⚙</span>
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded bg-white/10 text-white/90 hover:bg-white/15"
            aria-label="Menu"
          >
            <span className="text-[11px]">≡</span>
          </button>
        </div>
      </div>
    </header>
  )
}
