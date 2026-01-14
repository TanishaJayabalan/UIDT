import React, { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Navigation, Users, AlertTriangle, TrendingDown, MapPin, Clock } from 'lucide-react';

const TrafficReport = ({ data }) => {
  const [selectedSolution, setSelectedSolution] = useState(0);

  // Use passed data or fallback to defaults (safety check)
  const reportData = data || {
    reportName: "Default Report",
    collaborators: [],
    fromPlace: "Unknown",
    toPlace: "Unknown",
    totalPeople: 0,
    routes: []
  };

  const adoptionRate = data ? data.adoptionRate : 50;

  // Transform the simple solutions object from MapCommandCenter into rich objects for the view
  // In a real app, this logic might live on the backend or be shared config
  const enabledSolutions = data && data.solutions ? data.solutions : {};

  const baseSolutions = [
    {
      id: 'highway',
      name: "Highway Addition",
      diversion: 35,
      trafficReduction: 42,
      timeReduction: 28,
      cautions: ["Land acquisition needed", "Environmental impact study required"],
      baseTraffic: [45, 78, 95, 88, 65, 52, 58, 82, 92, 75]
    },
    {
      id: 'underpass',
      name: "Underpass Construction",
      diversion: 25,
      trafficReduction: 30,
      timeReduction: 20,
      cautions: ["High construction noise", "Temporary traffic diversion needed"],
      baseTraffic: [45, 78, 95, 88, 65, 52, 58, 82, 92, 75]
    },
    {
      id: 'widening',
      name: "Road Widening",
      diversion: 15,
      trafficReduction: 20,
      timeReduction: 15,
      cautions: ["Tree removal required", "Utility relocation"],
      baseTraffic: [45, 78, 95, 88, 65, 52, 58, 82, 92, 75]
    },
    {
      id: 'signal',
      name: "Smart Signal Optimization",
      diversion: 0,
      trafficReduction: 25,
      timeReduction: 18,
      cautions: ["Initial calibration period", "Requires reliable power backup"],
      baseTraffic: [45, 78, 95, 88, 65, 52, 58, 82, 92, 75]
    }
  ];

  // Filter solutions to only those selected, or show all if none selected (demo mode)
  // Actually, let's just show the ones the user checked. If none, show a default.
  let activeSolutions = baseSolutions.filter(s => enabledSolutions[s.id]);
  if (activeSolutions.length === 0) activeSolutions = [baseSolutions[0]]; // fallback

  const currentSolution = activeSolutions[selectedSolution] || activeSolutions[0];

  // --- Calculations ---
  const adjustedDiversion = Math.round(currentSolution.diversion * (adoptionRate / 100));
  const adjustedReduction = Math.round(currentSolution.trafficReduction * (adoptionRate / 100));
  const adjustedTimeSaved = Math.round(currentSolution.timeReduction * (adoptionRate / 100));

  const times = ["6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM", "12 PM", "5 PM", "6 PM", "7 PM"];

  const combinedTraffic = currentSolution.baseTraffic.map((density, idx) => {
    // Logic: apply reduction factor based on adoption
    const reductionFactor = (currentSolution.trafficReduction / 100) * (adoptionRate / 100);
    const afterDensity = Math.max(0, Math.round(density * (1 - reductionFactor)));
    return {
      time: times[idx],
      before: density,
      after: afterDensity
    };
  });

  const heatmapData = [
    { section: "Entry Point", before: 95, after: combinedTraffic[2].after },
    { section: "Middle Zone", before: 88, after: combinedTraffic[3].after },
    { section: "Junction A", before: 92, after: combinedTraffic[8].after },
    { section: "Junction B", before: 85, after: combinedTraffic[7].after },
    { section: "Exit Point", before: 75, after: combinedTraffic[9].after }
  ];

  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  const getHeatColor = (density) => {
    if (density >= 80) return 'bg-red-500';
    if (density >= 60) return 'bg-orange-500';
    if (density >= 40) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8 border-4 border-purple-200">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-2">
                {reportData.reportName}
              </h1>
              <div className="flex items-center gap-2 text-gray-600 mt-4">
                <Users className="w-5 h-5" />
                <span className="font-semibold">Collaborators:</span>
                <span>{reportData.collaborators.join(" • ")}</span>
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-6 rounded-2xl text-white shadow-lg">
              <Navigation className="w-12 h-12" />
            </div>
          </div>

          {/* Route Info */}
          <div className="grid grid-cols-2 gap-6 mt-8">
            <div className="bg-gradient-to-br from-blue-100 to-blue-200 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-6 h-6 text-blue-600" />
                <span className="text-sm font-semibold text-blue-900">FROM</span>
              </div>
              <p className="text-2xl font-bold text-blue-900">{reportData.fromPlace}</p>
            </div>
            <div className="bg-gradient-to-br from-purple-100 to-purple-200 p-6 rounded-2xl">
              <div className="flex items-center gap-3 mb-2">
                <MapPin className="w-6 h-6 text-purple-600" />
                <span className="text-sm font-semibold text-purple-900">TO</span>
              </div>
              <p className="text-2xl font-bold text-purple-900">{reportData.toPlace}</p>
            </div>
          </div>
        </div>

        {/* Total People Traveling */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 mb-8 border-4 border-blue-200">
          <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Approximate Number of People Traveling
          </h2>
          <div className="text-center mb-8">
            <div className="text-6xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              {reportData.totalPeople.toLocaleString()}
            </div>
            <p className="text-xl text-gray-600 mt-2">Daily Commuters (Estimated from Zone)</p>
          </div>

          {/* Route Distribution */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {reportData.routes.map((route, idx) => (
              <div key={idx} className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-4 border-2 border-purple-200">
                <h3 className="text-lg font-bold text-purple-900 mb-2">{route.name}</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">People:</span>
                    <span className="font-bold text-purple-600">{route.people.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Distance:</span>
                    <span className="font-semibold text-gray-900 text-sm">{route.distance}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700">Avg Time:</span>
                    <span className="font-semibold text-gray-900 text-sm">{route.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Solutions Section */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border-4 border-green-200">
          <h2 className="text-4xl font-bold text-gray-800 mb-6 flex items-center gap-3">
            <TrendingDown className="w-10 h-10 text-green-600" />
            Projections based on Selected Solutions
          </h2>

          {/* Adoption Rate Display */}
          <div className="mb-8 p-4 bg-indigo-50 rounded-lg text-center border-l-4 border-indigo-500">
            <span className="text-lg text-indigo-900 font-medium">Modeling for Adoption Rate: </span>
            <span className="text-3xl font-bold text-indigo-700 ml-2">{adoptionRate}%</span>
          </div>

          {/* Solution Tabs */}
          <div className="flex gap-4 mb-8 overflow-x-auto pb-2">
            {activeSolutions.map((sol, idx) => (
              <button
                key={idx}
                onClick={() => setSelectedSolution(idx)}
                className={`px-6 py-3 rounded-xl font-bold transition-all whitespace-nowrap ${selectedSolution === idx
                    ? 'bg-gradient-to-r from-green-500 to-blue-500 text-white shadow-lg scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                {sol.name}
              </button>
            ))}
          </div>

          {/* Solution Details */}
          <div className="space-y-8">
            {/* Impact Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gradient-to-br from-green-100 to-green-200 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-green-900 mb-2">Traffic Diversion</p>
                <p className="text-5xl font-bold text-green-700">{adjustedDiversion}%</p>
              </div>
              <div className="bg-gradient-to-br from-blue-100 to-blue-200 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-blue-900 mb-2">Traffic Reduction</p>
                <p className="text-5xl font-bold text-blue-700">{adjustedReduction}%</p>
              </div>
              <div className="bg-gradient-to-br from-purple-100 to-purple-200 rounded-2xl p-6 text-center">
                <p className="text-sm font-semibold text-purple-900 mb-2">Time Saved</p>
                <p className="text-5xl font-bold text-purple-700">{adjustedTimeSaved}%</p>
              </div>
            </div>

            {/* Traffic Density Over Time */}
            <div className="bg-gray-50 rounded-2xl p-6">
              <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">
                <Clock className="w-6 h-6" />
                Hourly Traffic Volume
              </h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={combinedTraffic}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line dataKey="before" name="Current Baseline" stroke="#ef4444" strokeWidth={3} />
                  <Line dataKey="after" name="Predicted" stroke="#10b981" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Cautions */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl p-6 border-2 border-red-200">
              <h3 className="text-2xl font-bold text-red-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-7 h-7" />
                Implementation Challenges
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentSolution.cautions.map((caution, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-white p-4 rounded-xl shadow">
                    <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" />
                    <p className="text-gray-800">{caution}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrafficReport;
