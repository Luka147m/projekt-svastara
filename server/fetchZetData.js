const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const crypto = require('crypto');
const { pool } = require('./db');
const { fetchTrafficData } = require('./fetchTrafficData');

const feedUrl = 'https://www.zet.hr/gtfs-rt-protobuf';
var data = [];
const coordinatesQueue = [];
let isProcessingQueue = false;

function queueCoordinates(position) {
  coordinatesQueue.push(position);
  processQueue();
}

async function processQueue() {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  while (coordinatesQueue.length > 0) {
    const position = coordinatesQueue.shift();
    await fetchTrafficData(position);
  }

  isProcessingQueue = false;
}

async function fetchData() {
  try {
    const response = await fetch(feedUrl);
    if (!response.ok) {
      const error = new Error(
        `${response.url}: ${response.status} ${response.statusText}`
      );
      error.response = response;
      throw error;
    }
    const buffer = await response.arrayBuffer();
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer)
    );
    console.log(
      feed.header
        ? `[INFO] Data refreshed - Feed timestamp: ${convertUnixToLocalTime(
            feed.header.timestamp
          )}`
        : '[INFO] Data refreshed - No feed timestamp found'
    );

    const stops = {};
    const vehicles = {};

    feed.entity.forEach((entity) => {
      if (entity) parseEntity(entity, stops, vehicles);
    });

    storeData(stops, vehicles);
  } catch (error) {
    console.log(error);
  }
}

function generateHash(data) {
  return crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function convertUnixToLocalTime(unixTime) {
  if (typeof unixTime === 'string') {
    unixTime = parseInt(unixTime, 10);
  }
  const date = new Date(unixTime * 1000);
  const formattedDate = date.toISOString().slice(0, 19).replace('T', ' ');
  return formattedDate;
}

function parseEntity(entity, stops, vehicles) {
  let watchedRoute = '17';

  try {
    if (entity.vehicle?.trip?.routeId === watchedRoute) {
      const baseId = entity.id.split('_')[0];
      vehicles[baseId] = vehicles[baseId] || [];
      vehicles[baseId].push({
        id: entity.id,
        tripid: entity.vehicle.trip.tripId,
        routeId: entity.vehicle.trip.routeId,
        position: entity.vehicle.position,
        timestamp: convertUnixToLocalTime(entity.vehicle.timestamp),
        vehicleId: entity.vehicle.vehicle.id,
      });
    }

    if (entity.tripUpdate?.trip?.routeId === watchedRoute) {
      const baseId = entity.id;
      const lastStopUpdate = entity.tripUpdate.stopTimeUpdate.at(-1);

      const arrival = lastStopUpdate.arrival || {};
      const departure = lastStopUpdate.departure || {};

      stops[baseId] = stops[baseId] || [];
      stops[baseId].push({
        id: entity.id,
        tripId: entity.tripUpdate.trip.tripId,
        routeId: entity.tripUpdate.trip.routeId,
        stopId: lastStopUpdate.stopId,
        currentStopSequence: lastStopUpdate.stopSequence,
        arrivedAt: arrival.time
          ? convertUnixToLocalTime(arrival.time)
          : departure.time
          ? convertUnixToLocalTime(departure.time)
          : null,
        reportedDelay: arrival.delay
          ? arrival.delay
          : departure.delay
          ? departure.delay
          : null,
      });
    }
  } catch (error) {
    console.error('[Error] Entity processing failed:', error.message);
    console.error('Entity causing the error:', JSON.stringify(entity, null, 2));
  }
}

async function storeData(stops, vehicles) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const [baseId, stopArray] of Object.entries(stops)) {
      for (const stop of stopArray) {
        const hash = generateHash(stop);
        const query = `
          INSERT INTO stopUpdates (hash, id, tripId, routeId, stopId, currentStopSequence, arrivedAt, reportedDelay)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (hash) DO NOTHING;
        `;
        const values = [
          hash,
          stop.id,
          stop.tripId,
          stop.routeId,
          stop.stopId,
          stop.currentStopSequence,
          stop.arrivedAt,
          stop.reportedDelay,
        ];
        await client.query(query, values);
      }
    }

    for (const [baseId, vehicleArray] of Object.entries(vehicles)) {
      for (const vehicle of vehicleArray) {
        const hash = generateHash(vehicle);
        queueCoordinates(vehicle.position);
        const query = `
          INSERT INTO vehicleUpdates (hash, id, tripId, routeId, position, timestamp, vehicleId)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (hash) DO NOTHING;
        `;
        const values = [
          hash,
          vehicle.id,
          vehicle.tripid,
          vehicle.routeId,
          JSON.stringify(vehicle.position),
          vehicle.timestamp,
          vehicle.vehicleId,
        ];

        await client.query(query, values);
      }
    }

    await client.query('COMMIT');
    console.log('[INFO] Data successfully stored in the database.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Error] Failed to store data:', error.message);
  } finally {
    client.release();
  }
}

async function fetchZetData() {
  await fetchData();
  return data;
}

module.exports = {
  fetchZetData,
};
