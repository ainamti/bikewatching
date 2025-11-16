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

// Convert minutes since midnight → formatted HH:MM AM/PM
function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}

// Compute station traffic (arrivals, departures, total)
function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(trips, (v) => v.length, (d) => d.start_station_id);
  const arrivals = d3.rollup(trips, (v) => v.length, (d) => d.end_station_id);

  return stations.map((station) => {
    const id = station.short_name;
    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });
}

// Convert Date → minutes since midnight
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Filter trips by selected time (± 60 minutes)
function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) return trips;
  return trips.filter((trip) => {
    const startedMinutes = minutesSinceMidnight(trip.started_at);
    const endedMinutes = minutesSinceMidnight(trip.ended_at);
    return Math.abs(startedMinutes - timeFilter) <= 60 ||
           Math.abs(endedMinutes - timeFilter) <= 60;
  });
}

map.on('load', async () => {
  // --- Bike lane layers ---
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

  // --- Load data ---
  const jsonData = await d3.json(
    'https://dsc106.com/labs/lab07/data/bluebikes-stations.json'
  );

  const trips = await d3.csv(
    'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
    (d) => {
      d.started_at = new Date(d.started_at);
      d.ended_at = new Date(d.ended_at);
      return d;
    }
  );

  let stations = computeStationTraffic(jsonData.data.stations, trips);

  const radiusScale = d3
    .scaleSqrt()
    .domain([0, d3.max(stations, (d) => d.totalTraffic)])
    .range([0, 25]);

  // --- Tooltip div ---
  const tooltip = d3
    .select('body')
    .append('div')
    .attr('class', 'station-tooltip')
    .style('position', 'absolute')
    .style('padding', '4px 8px')
    .style('background', 'white')
    .style('border', '1px solid #ccc')
    .style('border-radius', '4px')
    .style('pointer-events', 'none')
    .style('display', 'none');

  // --- Append circles ---
  let circles = svg
    .selectAll('circle')
    .data(stations, (d) => d.short_name)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.6)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('pointer-events', 'auto')
    .on('mouseover', (event, d) => {
      tooltip
        .style('display', 'block')
        .html(
          `<strong>${d.name}</strong><br/>
          ${d.totalTraffic} trips<br/>
          ${d.departures} departures<br/>
          ${d.arrivals} arrivals`
        );
    })
    .on('mousemove', (event) => {
      tooltip
        .style('left', event.pageX + 10 + 'px')
        .style('top', event.pageY + 10 + 'px');
    })
    .on('mouseleave', () => tooltip.style('display', 'none'));

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

  // --- Slider filter ---
  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }

  function filterTripsByTime(trips, timeFilter) {
    if (timeFilter === -1) return trips;
    return trips.filter((trip) => {
      const startedMinutes = minutesSinceMidnight(trip.started_at);
      const endedMinutes = minutesSinceMidnight(trip.ended_at);
      return (
        Math.abs(startedMinutes - timeFilter) <= 60 ||
        Math.abs(endedMinutes - timeFilter) <= 60
      );
    });
  }

  function updateScatterPlot(timeFilter) {
    const filteredTrips = filterTripsByTime(trips, timeFilter);
    const filteredStations = computeStationTraffic(stations, filteredTrips);

    // Adjust circle size dynamically
    timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);

    circles = circles
      .data(filteredStations, (d) => d.short_name)
      .join('circle')
      .attr('r', (d) => radiusScale(d.totalTraffic))
      .on('mouseover', (event, d) => {
        tooltip
          .style('display', 'block')
          .html(
            `<strong>${d.name}</strong><br/>
            ${d.totalTraffic} trips<br/>
            ${d.departures} departures<br/>
            ${d.arrivals} arrivals`
          );
      })
      .on('mousemove', (event) => {
        tooltip
          .style('left', event.pageX + 10 + 'px')
          .style('top', event.pageY + 10 + 'px');
      })
      .on('mouseleave', () => tooltip.style('display', 'none'));
    
    updatePositions();
  }

  function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }

  function updateTimeDisplay() {
    const timeFilter = Number(timeSlider.value);
    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();
});