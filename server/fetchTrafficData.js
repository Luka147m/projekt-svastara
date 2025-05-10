// const { pool } = require('./db');
const dotenv = require('dotenv');
dotenv.config();

const key = process.env.TOMTOM_API_KEY;

const versionNumber = '4';
const style = 'relative0';
const zoom = '18';
const format = 'json';
const unit = 'KMPH';
const openLr = 'false';

function formatCoordinates(coordinates) {
  let { lat, lon } = coordinates;
  if (lat < -90 || lat > 90) {
    throw new Error('[ERROR] Latitude must be between -90.00000 and 90.00000.');
  }
  if (lon < -180 || lon > 180) {
    throw new Error(
      '[ERROR] Longitude must be between -180.00000 and 180.00000.'
    );
  }

  return `${lat.toFixed(5)},${lon.toFixed(5)}`;
}

async function fetchTrafficData(coordinates) {
  let point;

  try {
    point = formatCoordinates(coordinates);
  } catch (error) {
    throw new Error(`[ERROR] Invalid coordinates: ${error.message}`);
  }

  const url = `https://api.tomtom.com/traffic/services/${versionNumber}/flowSegmentData/${style}/${zoom}/${format}?point=${point}&unit=${unit}&openLr=${openLr}&key=${key}`;

  const response = await fetch(url);

  if (response.status === 429) {
    throw new Error('[ERROR] Rate limit exceeded (HTTP 429).');
  }

  if (!response.ok) {
    const responseBody = await response.text();
    console.error('[ERROR] Response body:', responseBody);

    console.log(url);

    throw new Error(
      `[ERROR] HTTP error! Status: ${response.status}, Response: ${responseBody}`
    );
  }

  const data = await response.json();
  const segment = data.flowSegmentData;

  return {
    coordinates: coordinates,
    currentSpeed: segment.currentSpeed,
    freeFlowSpeed: segment.freeFlowSpeed,
    currentTravelTime: segment.currentTravelTime,
    freeFlowTravelTime: segment.freeFlowTravelTime,
    roadClosure: segment.roadClosure,
  };
}

// async function storeTrafficData(data, coordinates) {
//   const query = `
//         INSERT INTO trafficdata (coordinates, currentspeed, freeflowspeed, currenttraveltime, freeflowtraveltime, roadclosure)
//         VALUES ($1, $2, $3, $4, $5, $6)
//     `;

//   try {
//     await pool.query(query, values);
//   } catch (err) {
//     console.error('[ERROR] Error storing traffic data:', err);
//   }
// }

module.exports = { fetchTrafficData };
