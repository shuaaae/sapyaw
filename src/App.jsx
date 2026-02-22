import { useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Overview from './pages/Overview.jsx'
import StudyAreaPage from './pages/StudyAreaPage.jsx'
import DistributionMaps from './pages/DistributionMaps.jsx'
import MigrationPatterns from './pages/MigrationPatterns.jsx'
import ChartsData from './pages/ChartsData.jsx'
import Downloads from './pages/Downloads.jsx'

function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-900">
      <div className="flex min-h-screen flex-col">
        <Navbar onMenuToggle={() => setIsSidebarOpen(!isSidebarOpen)} />

        <div className="flex flex-1 overflow-hidden relative">
          <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
          
          <main className="flex-1 overflow-y-auto relative z-10">
            <div className="mx-auto max-w-[1920px] p-4 md:p-6 lg:p-8">
              <Routes>
                <Route path="/" element={<Navigate to="/overview" replace />} />
                <Route path="/overview" element={<Overview />} />
                <Route path="/study-area" element={<StudyAreaPage />} />
                <Route path="/distribution-maps" element={<DistributionMaps />} />
                <Route path="/migration-patterns" element={<MigrationPatterns />} />
                <Route path="/charts-data" element={<ChartsData />} />
                <Route path="/downloads" element={<Downloads />} />
                <Route path="*" element={<Navigate to="/overview" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}

export default App
