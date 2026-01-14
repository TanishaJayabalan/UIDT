import React, { useState } from 'react'
import TrafficReport from './components/TrafficReport'
import MapCommandCenter from './components/MapCommandCenter'

export default function App() {
  const [screen, setScreen] = useState('map') // 'map' | 'report'
  const [reportData, setReportData] = useState(null)

  const handleGenerateReport = (data) => {
    setReportData(data);
    setScreen('report');
  }

  return (
    <div className="h-screen">
      <div className="p-2 bg-white shadow-md flex gap-2">
        <button onClick={() => setScreen('map')} className={`px-3 py-1 rounded ${screen === 'map' ? 'bg-sky-600 text-white' : 'bg-gray-100'}`}>Command Center</button>
        <button onClick={() => setScreen('report')} className={`px-3 py-1 rounded ${screen === 'report' ? 'bg-sky-600 text-white' : 'bg-gray-100'}`} disabled={!reportData}>Traffic Report</button>
      </div>
      {screen === 'map' ? <MapCommandCenter onGenerate={handleGenerateReport} /> : <TrafficReport data={reportData} />}
    </div>
  )
}
