import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';

mapboxgl.accessToken =
  'pk.eyJ1IjoiYWluYW10aSIsImEiOiJjbWkxM2UzM2cwcWd4MnFvZzR3c2g3eHM2In0.p_rRaTty7iMa8rrOlb64Mg';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

map.on('load', async () => {
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: { 'line-color': 'green', 'line-width': 3, 'line-opacity': 0.4 },
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://data.cambridgema.gov/resource/aqh5-83rt.geojson?$limit=50000',
  });
  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: { 'line-color': '#32D400', 'line-width': 3, 'line-opacity': 0.6 },
  });

  const svg = d3.select('#map').select('svg');

  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { x, y };
  }

  // Load station and traffic data
  const jsonData = await d3.json(
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
  );
  let stations = jsonData.data.stations;

  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv'
  );

  const departures = d3.rollup(trips, (v) => v.length, (d) => d.start_station_id);
  const arrivals = d3.rollup(trips, (v) => v.length, (d) => d.end_station_id);

  stations = stations.map((s) => {
    const id = s.short_name;
    s.departures = departures.get(id) ?? 0;
    s.arrivals = arrivals.get(id) ?? 0;
    s.totalTraffic = s.departures + s.arrivals;
    return s;
  });

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // Append circles and add <title> for native browser tooltip
  const circles = svg
    .selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.6)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('pointer-events', 'auto')
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(
          `${d.name}\n${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
        );
    });

  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).x)
      .attr('cy', (d) => getCoords(d).y);
  }

  updatePositions();

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});