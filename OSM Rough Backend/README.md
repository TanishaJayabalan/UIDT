SUMO Web Integration

This minimal project provides a Flask backend that downloads OSM data (via Overpass), converts it to SUMO network format, optionally merges a user-specified custom highway, generates random trips, and runs SUMO to produce an FCD trace (`data/trace.xml`).

Prerequisites
- Install SUMO and set the `SUMO_HOME` environment variable.
- Python 3.8+ and pip. Install dependencies:

```bash
pip install -r requirements.txt
```

Run
1. Start the backend:

```bash
python app.py
```

2. Open http://127.0.0.1:5000 in your browser.
3. Use the map: select a bounding box, optionally draw a new highway, then run the simulation.

Viewing results
- Open SUMO-GUI and load `sumo_web/data/final.net.xml` and `sumo_web/data/trips.xml`, then play.
- The backend also writes `sumo_web/data/trace.xml` (FCD) which can be converted to JSON for browser animation.

Next steps
- Add a trace.xml -> trace.json converter and a Leaflet playback frontend.
- Add error handling and async task queue for long SUMO runs.
