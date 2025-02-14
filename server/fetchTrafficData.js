const { pool } = require('./db');

const versionNumber = '4';
const style = 'relative0';
const zoom = '20';
const format = 'json';
const unit = 'KMPH';
const openLr = 'false';
const key = 'QSvmF7Ce87f2yyZnSRje1V2hkt3I9b5b';

// Treba napravit neki mehanizam za ponovnu aktivaciju fetcha nakon sto se API limit makne
let apiLimit = false;

function formatCoordinates(coordinates) {
  let { latitude, longitude } = coordinates;
  if (latitude < -90 || latitude > 90) {
    throw new Error('[ERROR] Latitude must be between -90.00000 and 90.00000.');
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error(
      '[ERROR] Longitude must be between -180.00000 and 180.00000.'
    );
  }

  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

async function fetchTrafficData(coordinates) {
  if (apiLimit) {
    // console.log('[INFO] API limit reached, skipping this fetch');
    return;
  }
  let point;

  try {
    point = formatCoordinates(coordinates);
  } catch (error) {
    console.error(error.message);
    return;
  }

  const url = `https://api.tomtom.com/traffic/services/${versionNumber}/flowSegmentData/${style}/${zoom}/${format}?point=${point}&unit=${unit}&openLr=${openLr}&key=${key}`;

  try {
    const response = await fetch(url);

    if (response.status === 429) {
      console.error(
        '[INFO] Received HTTP 429: Rate limit exceeded. Disabling fetchTrafficData.'
      );
      isDisabled = true;
      return;
    }

    if (!response.ok) {
      throw new Error(`[ERROR] HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    storeTrafficData(data.flowSegmentData, coordinates);
  } catch (error) {
    console.error('[ERROR] Error fetching traffic data:', error);
    console.error('[ERROR] URL:', url);
  }
}

async function storeTrafficData(data, coordinates) {
  const query = `
        INSERT INTO trafficdata (coordinates, currentspeed, freeflowspeed, currenttraveltime, freeflowtraveltime, roadclosure)
        VALUES ($1, $2, $3, $4, $5, $6)
    `;

  const values = [
    coordinates,
    data.currentSpeed,
    data.freeFlowSpeed,
    data.currentTravelTime,
    data.freeFlowTravelTime,
    data.roadClosure,
  ];

  try {
    await pool.query(query, values);
  } catch (err) {
    console.error('[ERROR] Error storing traffic data:', err);
  }
}

module.exports = { fetchTrafficData };
