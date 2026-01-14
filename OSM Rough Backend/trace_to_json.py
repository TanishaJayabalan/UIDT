import json
import argparse
import xml.etree.ElementTree as ET

"""
Simple converter: sumo FCD trace.xml -> trace.json
- Input: data/trace.xml (SUMO FCD output)
- Output: data/trace.json

Output format:
{
  "vehicles": {
    "veh0": [{"time": 0.0, "lat": 52.5, "lon": 13.4}, ...],
    ...
  }
}

Notes:
- SUMO FCD uses x=lon, y=lat for OSM-based nets created with netconvert.
- If your net uses a projection, coordinates may need conversion.
"""


def convert(input_path, output_path):
    tree = ET.parse(input_path)
    root = tree.getroot()

    vehicles = {}

    # SUMO FCD: <timestep time="0.00"> <vehicle id="veh0" x="..." y="..." /> </timestep>
    for timestep in root.findall('timestep'):
        time = float(timestep.get('time', '0'))
        for veh in timestep.findall('vehicle'):
            vid = veh.get('id')
            x = veh.get('x')
            y = veh.get('y')
            if vid is None or x is None or y is None:
                continue
            lon = float(x)
            lat = float(y)
            entry = {'time': time, 'lat': lat, 'lon': lon}
            vehicles.setdefault(vid, []).append(entry)

    out = {'vehicles': vehicles}
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(out, f)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert SUMO FCD trace.xml to JSON for Leaflet playback')
    parser.add_argument('--in', dest='infile', default='data/trace.xml', help='input trace.xml')
    parser.add_argument('--out', dest='outfile', default='data/trace.json', help='output trace.json')
    args = parser.parse_args()
    convert(args.infile, args.outfile)
    print(f'Wrote {args.outfile}')
