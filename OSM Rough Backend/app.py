import os
import subprocess
import requests
import traceback
import xml.etree.ElementTree as ET
import json
try:
    from pyproj import CRS, Transformer
except Exception:
    CRS = Transformer = None
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Ensure data directory exists
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

# Ensure static/leaflet assets exist (download server-side so browser loads same-origin)
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')
LEAFLET_DIR = os.path.join(STATIC_DIR, 'leaflet')
if not os.path.exists(LEAFLET_DIR):
    os.makedirs(LEAFLET_DIR, exist_ok=True)
    try:
        # Download Leaflet CSS and JS from unpkg to serve locally
        css_url = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        js_url = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        import requests as _req
        css_r = _req.get(css_url, timeout=30)
        js_r = _req.get(js_url, timeout=30)
        with open(os.path.join(LEAFLET_DIR, 'leaflet.css'), 'wb') as _f:
            _f.write(css_r.content)
        with open(os.path.join(LEAFLET_DIR, 'leaflet.js'), 'wb') as _f:
            _f.write(js_r.content)
    except Exception:
        # If server-side download fails, continue — frontend will still try CDN and may be blocked by tracking prevention
        pass
SUMO_HOME = os.environ.get('SUMO_HOME')

# Auto-detect SUMO_HOME if installed via pip
if not SUMO_HOME:
    import site
    for site_pkg in site.getsitepackages():
        possible_home = os.path.join(site_pkg, 'sumo')
        if os.path.exists(os.path.join(possible_home, 'bin', 'sumo')):
            SUMO_HOME = possible_home
            print(f"Auto-detected SUMO_HOME: {SUMO_HOME}")
            break

if SUMO_HOME:
    NETCONVERT = os.path.join(SUMO_HOME, 'bin', 'netconvert')
    SUMO_BIN = os.path.join(SUMO_HOME, 'bin', 'sumo')
    RANDOM_TRIPS = os.path.join(SUMO_HOME, 'tools', 'randomTrips.py')
else:
    NETCONVERT = SUMO_BIN = RANDOM_TRIPS = None


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/simulate', methods=['POST'])
def simulate():
    try:
        if not SUMO_HOME:
            return jsonify({
                'status': 'error',
                'message': 'SUMO_HOME not set. Please install SUMO and set SUMO_HOME environment variable.'
            }), 400

        data = request.json or {}
        bbox = data.get('bbox')  # expected [west, south, east, north]
        new_road = data.get('new_road')  # {from: [lat, lon], to: [lat, lon]}

        if not bbox:
            return jsonify({'status': 'error', 'message': 'bbox is required'}), 400

        # Normalize bbox values to ensure order: west, south, east, north
        try:
            lon1, lat1, lon2, lat2 = map(float, bbox)
            west = min(lon1, lon2)
            east = max(lon1, lon2)
            south = min(lat1, lat2)
            north = max(lat1, lat2)
            bbox = [west, south, east, north]
        except Exception:
            return jsonify({'status': 'error', 'message': 'Invalid bbox format. Expected [lon1, lat1, lon2, lat2]'}), 400

        # 1. Download OSM Data
        osm_file = os.path.join(DATA_DIR, 'map.osm')
        overpass_url = f'https://overpass-api.de/api/map?bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}'
        try:
            r = requests.get(overpass_url, timeout=60)
            r.raise_for_status()
        except Exception as e:
            return jsonify({'status': 'error', 'message': f'Failed to download OSM data: {e}'}), 500

        with open(osm_file, 'wb') as f:
            f.write(r.content)

        # 2. Initial Conversion to SUMO Net
        base_net = os.path.join(DATA_DIR, 'base.net.xml')
        final_net = os.path.join(DATA_DIR, 'final.net.xml')

        subprocess.run([NETCONVERT, '--osm-files', osm_file, '-o', base_net, '--geometry.remove', '--ramps.guess'], check=True)

        # 3. Add New Infrastructure (Highway)
        if new_road:
            nod = os.path.join(DATA_DIR, 'custom.nod.xml')
            edg = os.path.join(DATA_DIR, 'custom.edg.xml')

            # Prefer to write node coordinates in the same projection as the base net.
            # Extract projParameter from base_net (netconvert output) and use pyproj to convert lon/lat -> projected x,y.
            try:
                proj_param = None
                tree = ET.parse(base_net)
                root = tree.getroot()
                loc = root.find('location')
                if loc is not None:
                    proj_param = loc.get('projParameter')

                # Try dynamic import in case pyproj was installed after module import
                try:
                    from pyproj import CRS as _CRS, Transformer as _Transformer
                except Exception:
                    _CRS = _Transformer = None

                if proj_param and _CRS is not None:
                    crs = _CRS.from_proj4(proj_param)
                    transformer = _Transformer.from_crs('EPSG:4326', crs, always_xy=True)
                    # input is [lat, lon]
                    lon1, lat1 = new_road['from'][1], new_road['from'][0]
                    lon2, lat2 = new_road['to'][1], new_road['to'][0]
                    x1, y1 = transformer.transform(lon1, lat1)
                    x2, y2 = transformer.transform(lon2, lat2)
                else:
                    # Fallback: write raw lon/lat (may not align with net projection)
                    x1, y1 = new_road['from'][1], new_road['from'][0]
                    x2, y2 = new_road['to'][1], new_road['to'][0]
            except Exception:
                # On any parsing/transform error fall back to raw lon/lat
                x1, y1 = new_road['from'][1], new_road['from'][0]
                x2, y2 = new_road['to'][1], new_road['to'][0]

            with open(nod, 'w') as f:
                f.write('<nodes>\n')
                f.write('<node id="start" x="%s" y="%s"/>\n' % (x1, y1))
                f.write('<node id="end" x="%s" y="%s"/>\n' % (x2, y2))
                f.write('</nodes>\n')

            # Determine edge attributes based on infrastructure type
            infra_type = data.get('infra_type', 'road')
            
            # Default attributes
            attributes = 'numLanes="3" speed="33.33" type="highway.motorway"'
            
            # Apply OSM-style tags for structures
            if infra_type == 'flyover':
                # Layer 1 means above ground (bridge)
                attributes += ' priority="20" shape="" spreadType="center"' 
                # Note: SUMO uses specific attributes. For visualization/netconvert we can try to hint layer.
                # However, raw edges in .edg.xml support standard attributes. 
                # To simulate a bridge, we can just ensure it connects correctly.
                # But to be explicit for advanced users:
                # We can add params if needed, but for now we stick to standard edge attributes.
                # Let's add a "name" to identify it.
                attributes += ' name="Proposed Flyover"'
                
            elif infra_type == 'tunnel':
                attributes += ' name="Proposed Tunnel"'

            with open(nod, 'w') as f:
                f.write('<nodes>\n')
                # Z-height: SUMO supports 3D. 
                # Flyover: Start 0, Middle high? No, simple connection for now.
                f.write('<node id="start" x="%s" y="%s"/>\n' % (x1, y1))
                f.write('<node id="end" x="%s" y="%s"/>\n' % (x2, y2))
                f.write('</nodes>\n')

            with open(edg, 'w') as f:
                f.write('<edges>\n')
                # To actually make it a bridge/tunnel in SUMO efficiently without conflicting 
                # with ground, we typically need 3D or ignoring conflicts.
                # For this simplified demo, we just label it.
                f.write('<edge id="new_hwy" from="start" to="end" %s />\n' % attributes)
                f.write('</edges>\n')

            # Pass --geometry.remove to clean up but we want to keep our new edge
            # We add --ignore-errors to avoid connectivity complaints if endpoints are far from existing roads (though they should be close)
            subprocess.run([NETCONVERT, '--sumo-net-file', base_net, '-n', nod, '-e', edg, '-o', final_net, '--ignore-errors'], check=True)
        else:
            os.replace(base_net, final_net)

        # 4. Generate Random Traffic
        trips = os.path.join(DATA_DIR, 'trips.xml')
        # Call randomTrips.py via python
        subprocess.run([os.sys.executable, RANDOM_TRIPS, '-n', final_net, '-e', '100', '-o', trips], check=True)

        # 5. Run SUMO and export Trace (FCD Output)
        trace = os.path.join(DATA_DIR, 'trace.xml')
        subprocess.run([SUMO_BIN, '-n', final_net, '-r', trips, '--fcd-output', trace, '--begin', '0', '--end', '100'], check=True)

        # 6. Convert to JSON
        trace_json_path = os.path.join(DATA_DIR, 'trace.json')
        try:
            import trace_to_json
            trace_to_json.convert(trace, trace_json_path)
            
            # Read and return the JSON data
            with open(trace_json_path, 'r') as f:
                simulation_data = json.load(f)
                
            return jsonify({
                'status': 'success', 
                'message': 'Simulation generated.',
                'data': simulation_data
            })
        except Exception as e:
            return jsonify({'status': 'warning', 'message': 'Simulation ran but JSON conversion failed: ' + str(e)}), 200

    except Exception as exc:
        tb = traceback.format_exc()
        return jsonify({'status': 'error', 'message': str(exc), 'trace': tb}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5001)
