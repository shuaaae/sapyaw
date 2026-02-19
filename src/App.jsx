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
  return (
    <>
      <div className="min-h-screen w-full bg-slate-200 text-slate-900">
        <div className="flex min-h-screen flex-col">
          <Navbar />

          <div className="min-h-0 flex-1 overflow-hidden">
            <main className="grid h-full min-h-0 gap-3 p-0 lg:grid-cols-[220px_1fr]">
              <div className="h-full min-h-0 overflow-hidden">
                <Sidebar />
              </div>
              <div className="h-full min-h-0 overflow-y-auto">
                <Routes>
                  <Route path="/" element={<Navigate to="/study-area" replace />} />
                  <Route path="/overview" element={<Overview />} />
                  <Route path="/study-area" element={<StudyAreaPage />} />
                  <Route path="/distribution-maps" element={<DistributionMaps />} />
                  <Route path="/migration-patterns" element={<MigrationPatterns />} />
                  <Route path="/charts-data" element={<ChartsData />} />
                  <Route path="/downloads" element={<Downloads />} />
                  <Route path="*" element={<Navigate to="/study-area" replace />} />
                </Routes>
              </div>
            </main>
          </div>
        </div>
      </div>
    </>
  )
}

export default App
