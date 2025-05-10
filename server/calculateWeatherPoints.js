// Bounding box Zagreba (odokativno, područje od interesa)
const minLat = 45.754529304822995;
const maxLat = 45.84615346359036;
const minLon = 15.864544642357348;
const maxLon = 16.080650715413128;

const gridSizeKm = 1.0; // 1x1 km grid
const earthKmPerDeg = 111.32;

function getGridCell(lat, lon) {
  const kmPerDegLon = earthKmPerDeg * Math.cos((lat * Math.PI) / 180);
  const gridX = Math.floor(((lon - minLon) * kmPerDegLon) / gridSizeKm);
  const gridY = Math.floor(((lat - minLat) * earthKmPerDeg) / gridSizeKm);
  return { gridX, gridY };
}

function getGridCenter(gridX, gridY) {
  const centerLat = minLat + (gridY + 0.5) * (gridSizeKm / earthKmPerDeg);
  const avgLat = centerLat;
  const kmPerDegLon = earthKmPerDeg * Math.cos((avgLat * Math.PI) / 180);
  const centerLon = minLon + (gridX + 0.5) * (gridSizeKm / kmPerDegLon);
  return {
    lat: Math.round(centerLat * 1e5) / 1e5,
    lon: Math.round(centerLon * 1e5) / 1e5,
  };
}

// Funkcija koja računa točke za vremensku prognozu na temelju tramvajskih stanica (mreža 1x1 km)
function calculateWeatherPoints(points) {
  const gridCells = {};

  points.forEach((stop) => {
    const { lat, lon } = stop;
    const { gridX, gridY } = getGridCell(lat, lon);

    if (!gridCells[`${gridX},${gridY}`]) {
      const center = getGridCenter(gridX, gridY);
      gridCells[`${gridX},${gridY}`] = center;
    }
  });

  return Object.values(gridCells);
}

// Primjer
// const tramStops = [
//   { lat: 45.798837, lon: 15.948454 },
//   { lat: 45.808111, lon: 15.991701 },
//   { lat: 45.792615, lon: 15.905252 },
//   { lat: 45.776843, lon: 15.956925 },
//   { lat: 45.794268, lon: 15.892597 },
//   { lat: 45.793219, lon: 15.901911 },
//   { lat: 45.79039, lon: 15.956037 },
//   { lat: 45.791855, lon: 15.91291 },
//   { lat: 45.799343, lon: 15.96322 },
//   { lat: 45.802432, lon: 15.964205 },
//   { lat: 45.777043, lon: 15.990388 },
//   { lat: 45.800297, lon: 15.9801 },
//   { lat: 45.7997, lon: 15.967661 },
//   { lat: 45.788248, lon: 15.940176 },
//   { lat: 45.819781, lon: 16.014988 },
//   { lat: 45.816591, lon: 16.00354 },
//   { lat: 45.788215, lon: 15.937466 },
//   { lat: 45.803327, lon: 15.964311 },
//   { lat: 45.797828, lon: 15.944096 },
//   { lat: 45.790753, lon: 15.944862 },
//   { lat: 45.799814, lon: 15.971155 },
//   { lat: 45.787792, lon: 15.930068 },
//   { lat: 45.786213, lon: 15.95076 },
//   { lat: 45.798713, lon: 15.961714 },
//   { lat: 45.767766, lon: 15.992178 },
//   { lat: 45.789897, lon: 15.920025 },
//   { lat: 45.777197, lon: 15.973007 },
//   { lat: 45.800764, lon: 15.988889 },
//   { lat: 45.787297, lon: 15.946516 },
//   { lat: 45.777402, lon: 15.981796 },
//   { lat: 45.786772, lon: 15.952371 },
//   { lat: 45.793392, lon: 15.95807 },
//   { lat: 45.804385, lon: 15.993636 },
//   { lat: 45.800039, lon: 15.95484 },
//   { lat: 45.800555, lon: 15.984929 },
//   { lat: 45.817623, lon: 16.008165 },
//   { lat: 45.801701, lon: 15.959307 },
//   { lat: 45.794373, lon: 15.898484 },
//   { lat: 45.77691, lon: 15.964189 },
//   { lat: 45.788246, lon: 15.944686 },
//   { lat: 45.788493, lon: 15.954746 },
//   { lat: 45.76425, lon: 16.002236 },
//   { lat: 45.814055, lon: 15.996525 },
//   { lat: 45.801971, lon: 15.994959 },
//   { lat: 45.796511, lon: 15.960194 },
//   { lat: 45.767983, lon: 15.998913 },
//   { lat: 45.777615, lon: 15.98654 },
//   { lat: 45.810915, lon: 15.993859 },
//   { lat: 45.771935, lon: 15.990624 },
//   { lat: 45.79334, lon: 15.944173 },
//   { lat: 45.800058, lon: 15.975462 },
// ];

// Primjer korištenja funkcije
// const weatherPoints = calculateWeatherPoints(tramStops);
// console.log('Weather query points (grid centers):', weatherPoints);

// Geojson.io format
// let geojson = { type: 'FeatureCollection', features: [] };

// for (const point of weatherPoints) {
//   geojson.features.push({
//     type: 'Feature',
//     properties: {},
//     geometry: {
//       type: 'Point',
//       coordinates: [point.lon, point.lat],
//     },
//   });
// }

// console.log(JSON.stringify(geojson, null, 2));

module.exports = { calculateWeatherPoints };
