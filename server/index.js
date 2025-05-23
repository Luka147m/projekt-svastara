// const express = require('express');
// const app = express();
const dotenv = require('dotenv');
dotenv.config();
const { pool } = require('./db');

const { fetchZetData } = require('./fetchZetData');
const { fetchWeather } = require('./fetchWeather');
const { fetchTrafficData } = require('./fetchTrafficData');
const { calculateWeatherPoints } = require('./calculateWeatherPoints');

// const TOMTOM_API_LIMIT = 2500;
const MAX_BUFFER_SIZE = 100;
const promatraneLinije = [5, 17, 109, 4, 13];

const activeTrips = new Map();
let finishedTripsBuffer = [];

const tripPatternsMap = new Map();
const weatherData = new Map();
const trafficData = new Map();

var queryCoordinates = [];
var weatherPoints = [];

async function fetchAndRefreshData() {
  try {
    const zetData = await fetchZetData();
    // console.log('[INFO] Inital data downloaded');
    // console.log(zetData);

    for (const vehicle of zetData) {
      const {
        tripId,
        routeId,
        currentStopSequence,
        arrivedAt,
        reportedDelay,
        position,
      } = vehicle;
      const patterns = tripPatternsMap.get(parseInt(routeId));
      if (!patterns) continue;

      const matchingPattern = patterns.find((p) => p.trips.includes(tripId));
      if (!matchingPattern) continue;

      const patternSequence = matchingPattern.sequence;

      // Skip first stop, because  arrivedAt: '1970-01-01 00:00:00',
      if (currentStopSequence === 1) continue;

      nextStopSequence = currentStopSequence + 1;
      const nextStop = patternSequence.find(
        (s) => s.stop_sequence === nextStopSequence
      );

      if (!nextStop) continue;

      const key = `${tripId}`;
      const active = activeTrips.get(key);

      if (
        active &&
        active.currentStopSequence === currentStopSequence - 1 &&
        new Date(arrivedAt) >= new Date(active.arrivedAt)
      ) {
        let finishedTrip = active;
        // console.log(
        //   `[INFO] Finished trip:
        //   routeId: ${finishedTrip.routeId},
        //   tripId: ${finishedTrip.tripId}
        //   currentStopSequence: ${finishedTrip.currentStopSequence},
        //   startedAt: ${finishedTrip.arrivedAt},
        //   reportedDelay: ${finishedTrip.reportedDelay},
        //   position: ${JSON.stringify(finishedTrip.position)},
        //   nextStop: ${JSON.stringify(finishedTrip.nextStop)},
        //   distance: ${finishedTrip.distance},
        //   finishedAt: ${arrivedAt},
        //   weather: ${JSON.stringify(finishedTrip.weather)},
        //   traffic: ${JSON.stringify(finishedTrip.traffic)}
        //   `
        // );

        finishedTripsBuffer.push({
          routeId: finishedTrip.routeId,
          tripId: finishedTrip.tripId,
          currentStopSequence: finishedTrip.currentStopSequence,
          startedAt: finishedTrip.arrivedAt,
          reportedDelay: finishedTrip.reportedDelay,
          position: JSON.stringify(finishedTrip.position),
          nextStop: JSON.stringify(finishedTrip.nextStop),
          distance: finishedTrip.distance,
          finishedAt: arrivedAt,
          weather: JSON.stringify(finishedTrip.weather),
          traffic: JSON.stringify(finishedTrip.traffic),
        });

        activeTrips.delete(key);

        if (finishedTripsBuffer.length >= MAX_BUFFER_SIZE) {
          await flushFinishedTrips();
        }
      }

      const nearestWeather = findNearest(position, weatherData);
      const nearestTraffic = findNearest(position, trafficData);

      const distance = haversine(
        position.lat,
        position.lon,
        nextStop.lat,
        nextStop.lon
      );

      activeTrips.set(key, {
        addedTimestamp: new Date(),
        ...vehicle,
        nextStop: nextStop,
        distance: distance,
        weather: nearestWeather,
        traffic: nearestTraffic,
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function findNearest(position, dataMap) {
  let minDistance = Infinity;
  let closestKey = null;

  for (const key of dataMap.keys()) {
    const [lat, lon] = key.split(',').map(Number);
    const dist = haversine(position.lat, position.lon, lat, lon);
    if (dist < minDistance) {
      minDistance = dist;
      closestKey = key;
    }
  }

  return closestKey ? dataMap.get(closestKey) : null;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => deg * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function cleanupActiveTrips() {
  const now = new Date();
  const MAX_AGE_MS = 5 * 60 * 1000; // 5 minuta

  let removed = 0;
  for (const [tripId, tripData] of activeTrips.entries()) {
    if (now - tripData.addedTimestamp > MAX_AGE_MS) {
      activeTrips.delete(tripId);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`[INFO] Cleaned up ${removed} expired trips from activeTrips.`);
  }

  console.log(`[INFO] Active trips count: ${activeTrips.size}`);
}

async function flushFinishedTrips() {
  if (finishedTripsBuffer.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const trip of finishedTripsBuffer) {
      // console.log(trip);
      const weather = JSON.parse(trip.weather || '{}');
      const traffic = JSON.parse(trip.traffic || '{}');

      await client.query(
        `
        INSERT INTO finished_trips (
          route_id, trip_id, current_stop_sequence, started_at, finished_at, reported_delay,
          position, nextStop, distance, weather_type, weather_conditions, temperature,
          feels_like, pressure, humidity, wind_speed, snow, rain,
          traffic_position, current_speed, free_flow_speed, current_travel_time,
          free_flow_travel_time, road_closure
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11, $12,
          $13, $14, $15, $16, $17, $18,
          $19, $20, $21, $22, $23, $24
        )
        `,
        [
          trip.routeId,
          trip.tripId,
          trip.currentStopSequence,
          trip.startedAt,
          trip.finishedAt,
          trip.reportedDelay,
          trip.position,
          trip.nextStop,
          trip.distance,
          weather.weatherType,
          weather.weatherConditions,
          weather.temperature,
          weather.feelsLike,
          weather.pressure,
          weather.humidity,
          weather.windSpeed,
          weather.snow,
          weather.rain,
          traffic.coordinates,
          traffic.currentSpeed,
          traffic.freeFlowSpeed,
          traffic.currentTravelTime,
          traffic.freeFlowTravelTime,
          traffic.roadClosure,
        ]
      );
    }

    await client.query('COMMIT');
    console.log(
      `[INFO] Inserted ${finishedTripsBuffer.length} finished trips.`
    );
    finishedTripsBuffer = [];
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[ERROR] Insert failed:', error);
  } finally {
    client.release();
  }
}

async function fetchWeatherData() {
  const weatherPromises = weatherPoints.map(async (point) => {
    // console.log('[INFO] Fetching weather data for point:', point);
    try {
      const weather = await fetchWeather(point);
      const key = `${point.lat},${point.lon}`;
      weatherData.set(key, weather);
      // console.log('[INFO] Weather data fetched:', weather);
    } catch (error) {
      console.error('[ERROR] Fetching weather data:', error);
    }
  });

  await Promise.all(weatherPromises);
}

async function fetchTraffic() {
  for (let i = 0; i < queryCoordinates.length; i++) {
    const point = queryCoordinates[i];
    try {
      const traffic = await fetchTrafficData(point);
      const key = `${point.lat},${point.lon}`;
      trafficData.set(key, traffic);
    } catch (error) {
      console.error('[ERROR] Fetching traffic data:', error);
      if (
        error.message.includes('Point too far from nearest existing segment')
      ) {
        console.log(
          `[INFO] Removing point from query: ${JSON.stringify(point)}`
        );
        queryCoordinates.splice(i, 1);
        i--; // adjust index
      }
    }
  }
}

// app.get('/', async (req, res) => {
//   res.json(zetData);
// });

async function startServer() {
  // Koordinate za query prometnih podataka i vremenskih podataka
  // Tocke se racunaju s obzirom na rutu (interpolacija rute)
  try {
    let pointsQuery = 'SELECT * FROM get_query_points($1::int[])';
    const result = await pool.query(pointsQuery, [promatraneLinije]);
    // console.log('[INFO] Points query result:', result.rows);
    queryCoordinates = result.rows.map((row) => {
      const { lat, lon } = row.jsonb;
      return { lat, lon };
    });
    // console.log('[INFO] Query coordinates:', queryCoordinates);
  } catch (err) {
    console.error('[ERROR] Error:', err);
    return;
  }

  console.log('[INFO] Query coordinates:', queryCoordinates.length);
  weatherPoints = calculateWeatherPoints(queryCoordinates);
  // console.log('[INFO] Weather points:', weatherPoints);
  console.log('[INFO] Weather points count:', weatherPoints.length);

  // Pre-baked raspored stanica i poredak (da izbjegnem pozive bazi)
  for (let i = 0; i < promatraneLinije.length; i++) {
    const routeId = promatraneLinije[i];
    try {
      const query = `SELECT get_trip_patterns(${promatraneLinije[i]});`;
      const result = await pool.query(query);
      // console.log(
      //   `[INFO] Trip patterns for line ${promatraneLinije[i]}:`,
      //   result.rows
      // );

      if (result.rows.length > 0) {
        const jsonArray = result.rows[0].get_trip_patterns;
        tripPatternsMap.set(routeId, jsonArray);
      }
    } catch (error) {
      console.error('[ERROR] Error:', error);
      return;
    }
  }

  // console.log('[INFO] Trip patterns map:', tripPatternsMap);

  await fetchWeatherData(); // Fetch once
  setInterval(fetchWeatherData, 15 * 60 * 1000); // 15 minuta

  await fetchTraffic(); // Fetch once
  setInterval(fetchTraffic, 15 * 60 * 1000); // 7-22hrs, 2500 poziva dnevno otprilike 50 poziva po grupi, otprilike svakih 18 minuta mogu
  // Nesto su promjenili pa se ovo racuna kao free tile request kojih mogu 50000 dnevno, prije se racunao kao nontile koji je bio 2500 dnevno???
  // 250 tocaka otprilike za ispitati, 50000 dnevnih upita, otprilike svakih 15 minuta

  await fetchAndRefreshData();
  setInterval(fetchAndRefreshData, 10000); // 10 sekundi

  setInterval(cleanupActiveTrips, 60 * 1000 * 3);
  setInterval(flushFinishedTrips, 1000 * 60 * 2);

  // app.listen(8080, () => {
  //   console.log('[INFO] Server started on port 8080');
  // });
}

startServer();
