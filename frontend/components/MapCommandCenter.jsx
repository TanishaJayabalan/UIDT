import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, FeatureGroup, useMap, Marker, Polyline } from 'react-leaflet';
import { EditControl } from 'react-leaflet-draw';
import L from 'leaflet';
import * as turf from '@turf/turf';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw/dist/leaflet.draw.css';

// Custom Icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const BENGALURU = [12.9716, 77.5946];

// Helper to move map view
function MapController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, zoom || 14);
  }, [center, zoom, map]);
  return null;
}

export default function MapCommandCenter({ onGenerate }) {
  // Helpers
  const editRef = useRef(null);

  // --- STATE ---
  const [step, setStep] = useState(1); // 1: Route, 2: Intervention, 3: Simulate
  const [mapCenter, setMapCenter] = useState(BENGALURU);
  const [statusMsg, setStatusMsg] = useState('Welcome! Please define your route.');

  // Step 1: Route
  const [startLoc, setStartLoc] = useState(null); // { lat, lon, name }
  const [endLoc, setEndLoc] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingStart, setIsSearchingStart] = useState(true); // true=Start, false=End
  const [searchResults, setSearchResults] = useState([]);

  // Step 2: Intervention
  const [interventionType, setInterventionType] = useState('infrastructure'); // 'infrastructure' | 'optimize'
  const [infraType, setInfraType] = useState('flyover'); // 'flyover' | 'tunnel'
  const [drawMethod, setDrawMethod] = useState(null); // 'auto' | 'manual'
  const [drawnFeature, setDrawnFeature] = useState(null); // GeoJSON

  const [optimizeOptions, setOptimizeOptions] = useState({
    widening: false,
    signal: false
  });

  // Step 3: Simulation Config
  const [email, setEmail] = useState('');


  // --- LOGIC: Step 1 Search ---
  async function handleSearch() {
    if (!searchQuery) return;
    setStatusMsg('Searching OSM...');
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`;
      const res = await fetch(url);
      const data = await res.json();
      setSearchResults(data);
      if (data.length === 0) setStatusMsg('No results found.');
    } catch (e) {
      console.error(e);
    }
  }

  function selectLocation(loc) {
    const item = {
      lat: parseFloat(loc.lat),
      lon: parseFloat(loc.lon),
      name: loc.display_name.split(',')[0]
    };

    setMapCenter([item.lat, item.lon]);

    if (isSearchingStart) {
      setStartLoc(item);
      setSearchQuery('');
      setIsSearchingStart(false); // Auto-switch to End
      setStatusMsg(`Start set to ${item.name}. Now search for Destination.`);
    } else {
      setEndLoc(item);
      setSearchQuery('');
      setSearchResults([]);
      setStatusMsg(`Route Set: ${startLoc?.name} to ${item.name}.`);
    }
  }

  // --- LOGIC: Step 2 Intervention ---
  function handleAutoConnect() {
    if (!startLoc || !endLoc) return;
    // Create a straight line geojson
    const line = turf.lineString([
      [startLoc.lon, startLoc.lat],
      [endLoc.lon, endLoc.lat]
    ]);
    setDrawnFeature(line);
    setDrawMethod('auto');
    setStatusMsg('System auto-connected points with a new road.');

    // Fit bounds
    const bbox = turf.bbox(line);
    // Note: we can't easily fitBounds on ref here without passing map ref down, 
    // but MapController handles center. simpler to just center on mid point
    const midLat = (startLoc.lat + endLoc.lat) / 2;
    const midLon = (startLoc.lon + endLoc.lon) / 2;
    setMapCenter([midLat, midLon]);
  }

  function startManualDraw() {
    setDrawMethod('manual');
    setDrawnFeature(null);
    setStatusMsg('Select the POLYLINE tool (top-left) to draw your custom path.');
    // Enable draw toolbar via CSS/State? 
    // We will toggle the toolbar visibility in render
  }

  const onCreated = (e) => {
    const layer = e.layer;
    const geojson = layer.toGeoJSON();
    setDrawnFeature(geojson);
    setStatusMsg('Manual path captured.');
  };

  // --- LOGIC: Step 3 Generate ---
  async function handleGenerate() {
    if (!startLoc || !endLoc) { setStatusMsg('Missing Route'); return; }
    if (!email.includes('@')) { setStatusMsg('Invalid Email'); return; }

    setStatusMsg('Initializing Simulation...');

    // 1. Calculate BBOX (Start/End + Buffer)
    const line = turf.lineString([
      [startLoc.lon, startLoc.lat],
      [endLoc.lon, endLoc.lat]
    ]);
    // Add buffer to line to get polygon area
    // Or just bbox of points
    const minLon = Math.min(startLoc.lon, endLoc.lon);
    const maxLon = Math.max(startLoc.lon, endLoc.lon);
    const minLat = Math.min(startLoc.lat, endLoc.lat);
    const maxLat = Math.max(startLoc.lat, endLoc.lat);

    // Add 0.01 padding
    const PDING = 0.01;
    const bbox = [minLon - PDING, minLat - PDING, maxLon + PDING, maxLat + PDING];

    // 2. Prepare New Road
    let newRoadData = null;
    if (interventionType === 'infrastructure' && drawnFeature) {
      const coords = drawnFeature.geometry.coordinates;
      // Handle MultiLineString vs LineString vs manual draw array
      // Leaflet Draw Polyline -> LineString
      if (coords && coords.length > 0) {
        // Format: {from: [lat, lon], to: [lat, lon]}
        // Currently backend only supports simple A->B new_road.
        // We will take start and end of the drawn line
        const start = coords[0]; // [lon, lat] for geojson
        const end = coords[coords.length - 1];
        newRoadData = {
          from: [start[1], start[0]],
          to: [end[1], end[0]]
        };
      }
    }

    // 3. Call Backend
    try {
      const res = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bbox,
          new_road: newRoadData,
          infra_type: infraType, // 'flyover' or 'tunnel'
          options: optimizeOptions // {widening: bool, signal: bool}
        })
      });
      const data = await res.json();

      if (data.status === 'success') {
        setStatusMsg('Simulation Complete detected!');

        // 4. Pass Request to Parent
        onGenerate({
          reportName: `Intervention: ${startLoc.name} - ${endLoc.name}`,
          collaborators: ["System"],
          fromPlace: startLoc.name,
          toPlace: endLoc.name,
          totalPeople: Math.floor(Math.random() * 40000),
          selectionGeoJSON: turf.bboxPolygon(bbox),
          simulationResults: data.data,
          solutions: {
            type: interventionType,
            infraType,
            ...optimizeOptions
          },
          adoptionRate: 75,
          routes: []
        });

      } else {
        setStatusMsg('Error: ' + data.message);
      }
    } catch (e) {
      console.error(e);
      setStatusMsg('Backend Error. Is server running?');
    }
  }


  // --- RENDER ---
  return (
    <div className="flex h-screen w-full font-sans">
      {/* MAP */}
      <div className="flex-1 relative">
        <MapContainer center={BENGALURU} zoom={13} style={{ height: "100%", width: "100%" }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="OSM" />
          <MapController center={mapCenter} />

          {/* Markers for Start/End */}
          {startLoc && <Marker position={[startLoc.lat, startLoc.lon]} />}
          {endLoc && <Marker position={[endLoc.lat, endLoc.lon]} />}

          {/* Drawn Feature (Auto) */}
          {drawMethod === 'auto' && drawnFeature && (
            <Polyline
              positions={drawnFeature.geometry.coordinates.map(c => [c[1], c[0]])}
              color="blue" weight={5} dashArray="10, 10"
            />
          )}

          {/* Manual Draw Control */}
          <FeatureGroup>
            <EditControl
              ref={editRef}
              position="topleft"
              onCreated={onCreated}
              draw={{
                rectangle: false, polygon: false, circle: false, circlemarker: false, marker: false,
                // Only enable polyline if Manual Mode selected
                polyline: drawMethod === 'manual' ? {
                  shapeOptions: { color: '#ff0000', weight: 4 }
                } : false
              }}
              edit={{ edit: false, remove: false }}
            />
          </FeatureGroup>

        </MapContainer>

        {/* STATUS BAR */}
        <div className="absolute top-4 left-16 right-4 z-[999]">
          <div className="bg-white/90 backdrop-blur shadow-md rounded-full px-6 py-2 text-sm font-medium text-center text-gray-700 border border-gray-200">
            {statusMsg}
          </div>
        </div>
      </div>

      {/* WIZARD SIDEBAR */}
      <aside className="w-96 bg-white border-l shadow-2xl z-[1000] flex flex-col">
        <div className="p-6 border-b bg-gray-50">
          <h1 className="text-xl font-extrabold text-gray-800">Traffic Wizard</h1>
          <div className="flex gap-2 mt-4 text-xs font-bold text-gray-400">
            <span className={`flex-1 pb-1 border-b-2 ${step >= 1 ? 'border-blue-500 text-blue-600' : 'border-gray-200'}`}>1. ROUTE</span>
            <span className={`flex-1 pb-1 border-b-2 ${step >= 2 ? 'border-blue-500 text-blue-600' : 'border-gray-200'}`}>2. INTERVENE</span>
            <span className={`flex-1 pb-1 border-b-2 ${step >= 3 ? 'border-blue-500 text-blue-600' : 'border-gray-200'}`}>3. SIMULATE</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">

          {/* STEP 1 */}
          <section className={step === 1 ? 'block' : 'hidden'}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Define Route</h2>

            <div className="space-y-4">
              <div className={`p-3 border rounded-lg cursor-pointer transition-all ${isSearchingStart ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-200' : 'border-gray-200'}`} onClick={() => setIsSearchingStart(true)}>
                <label className="text-xs font-bold text-gray-500 uppercase">Start Point (A)</label>
                <div className="text-sm font-medium text-gray-800">{startLoc ? startLoc.name : "Select Start..."}</div>
              </div>

              <div className={`p-3 border rounded-lg cursor-pointer transition-all ${!isSearchingStart ? 'ring-2 ring-blue-500 bg-blue-50 border-blue-200' : 'border-gray-200'}`} onClick={() => setIsSearchingStart(false)}>
                <label className="text-xs font-bold text-gray-500 uppercase">Destination (B)</label>
                <div className="text-sm font-medium text-gray-800">{endLoc ? endLoc.name : "Select Destination..."}</div>
              </div>

              <div className="relative">
                <input
                  className="w-full p-3 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder={isSearchingStart ? "Search Start Location..." : "Search Destination..."}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                // onKeyDown={e => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch} className="absolute right-2 top-2 bg-gray-800 text-white text-xs px-3 py-1.5 rounded">Search</button>

                {searchResults.length > 0 && (
                  <div className="absolute top-full left-0 w-full bg-white shadow-xl border rounded mt-1 z-50 max-h-40 overflow-auto">
                    {searchResults.map(res => (
                      <div key={res.place_id} onClick={() => selectLocation(res)} className="p-2 text-sm hover:bg-gray-100 cursor-pointer border-b">
                        {res.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              disabled={!startLoc || !endLoc}
              onClick={() => setStep(2)}
              className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg font-bold shadow hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next: Choose Intervention
            </button>
          </section>


          {/* STEP 2 */}
          <section className={step === 2 ? 'block' : 'hidden'}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Choose Solution</h2>

            {/* Toggle Main Type */}
            <div className="flex bg-gray-100 p-1 rounded-lg mb-6">
              <button onClick={() => setInterventionType('infrastructure')} className={`flex-1 py-2 text-sm font-medium rounded-md ${interventionType === 'infrastructure' ? 'bg-white shadow text-blue-600' : 'text-gray-500'}`}>Build New</button>
              <button onClick={() => setInterventionType('optimize')} className={`flex-1 py-2 text-sm font-medium rounded-md ${interventionType === 'optimize' ? 'bg-white shadow text-purple-600' : 'text-gray-500'}`}>Optimize</button>
            </div>

            {interventionType === 'infrastructure' && (
              <div className="space-y-6 animate-fadeIn">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Structure Type</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setInfraType('flyover')} className={`p-3 border rounded-lg text-sm text-center ${infraType === 'flyover' ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>Flyover</button>
                    <button onClick={() => setInfraType('tunnel')} className={`p-3 border rounded-lg text-sm text-center ${infraType === 'tunnel' ? 'border-blue-500 bg-blue-50 text-blue-700 font-bold' : 'hover:bg-gray-50'}`}>Tunnel</button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Drawing Method</label>
                  <div className="space-y-2">
                    <button onClick={handleAutoConnect} className={`w-full flex items-center justify-between p-3 border rounded-lg text-left hover:border-blue-300 ${drawMethod === 'auto' ? 'border-blue-500 bg-blue-50' : ''}`}>
                      <span className="text-sm font-medium">Auto-Connect (AI)</span>
                      <span className="text-xs text-gray-400">Straight Line</span>
                    </button>
                    <button onClick={startManualDraw} className={`w-full flex items-center justify-between p-3 border rounded-lg text-left hover:border-blue-300 ${drawMethod === 'manual' ? 'border-blue-500 bg-blue-50' : ''}`}>
                      <span className="text-sm font-medium">Draw Manually</span>
                      <span className="text-xs text-gray-400">Use Tool</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {interventionType === 'optimize' && (
              <div className="space-y-4 animate-fadeIn">
                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={optimizeOptions.widening} onChange={() => setOptimizeOptions(s => ({ ...s, widening: !s.widening }))} className="w-5 h-5 accent-purple-600" />
                  <div>
                    <div className="text-sm font-bold text-gray-800">Road Widening</div>
                    <div className="text-xs text-gray-500">Add lanes to existing route</div>
                  </div>
                </label>
                <label className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={optimizeOptions.signal} onChange={() => setOptimizeOptions(s => ({ ...s, signal: !s.signal }))} className="w-5 h-5 accent-purple-600" />
                  <div>
                    <div className="text-sm font-bold text-gray-800">Smart Signals</div>
                    <div className="text-xs text-gray-500">AI-driven signal timing</div>
                  </div>
                </label>
              </div>
            )}

            <div className="flex gap-3 mt-8">
              <button onClick={() => setStep(1)} className="px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Back</button>
              <button
                disabled={interventionType === 'infrastructure' && !drawnFeature}
                onClick={() => setStep(3)}
                className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-bold shadow hover:bg-blue-700 disabled:opacity-50"
              >
                Next: Analyze
              </button>
            </div>
          </section>

          {/* STEP 3 */}
          <section className={step === 3 ? 'block' : 'hidden'}>
            <h2 className="text-lg font-bold text-gray-800 mb-4">Finalize & Simulate</h2>

            <div className="bg-gray-50 p-4 rounded-lg border mb-6 text-sm text-gray-600 space-y-2">
              <div className="flex justify-between"><span>Start:</span> <span className="font-bold text-gray-800">{startLoc?.name}</span></div>
              <div className="flex justify-between"><span>End:</span> <span className="font-bold text-gray-800">{endLoc?.name}</span></div>
              <hr className="border-gray-200" />
              <div className="flex justify-between"><span>Action:</span> <span className="font-bold text-blue-600">{interventionType === 'infrastructure' ? `Build ${infraType}` : 'Optimize Route'}</span></div>
            </div>

            <div className="mb-6">
              <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">Send Report To</label>
              <input
                className="w-full p-3 border rounded-lg"
                placeholder="Email Address"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="px-4 py-3 text-sm font-bold text-gray-500 hover:bg-gray-100 rounded-lg">Back</button>
              <button onClick={handleGenerate} className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold shadow-lg hover:bg-green-700">
                Run Simulation
              </button>
            </div>
          </section>

        </div>
      </aside>
    </div>
  );
}
