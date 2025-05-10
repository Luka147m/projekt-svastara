const GtfsRealtimeBindings = require('gtfs-realtime-bindings');

const feedUrl = 'https://www.zet.hr/gtfs-rt-protobuf';
const promatraneLinije = [5, 17, 109];

async function fetchZetData() {
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

    console.log(
      `[INFO] Stops: ${Object.keys(stops).length}, Vehicles: ${
        Object.keys(vehicles).length
      }`
    );

    const combinedData = [];
    for (const stopBaseId in stops) {
      if (vehicles[stopBaseId]) {
        combinedData.push({
          tripId: stops[stopBaseId].tripId,
          routeId: stops[stopBaseId].routeId,
          currentStopSequence: stops[stopBaseId].currentStopSequence,
          arrivedAt: stops[stopBaseId].arrivedAt,
          reportedDelay: stops[stopBaseId].reportedDelay,
          position: vehicles[stopBaseId].position,
        });
      }
    }

    return combinedData;
    // return feed;
  } catch (error) {
    console.log(error);
  }
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
  try {
    if (entity.vehicle && entity.vehicle.trip) {
      const routeId = entity.vehicle.trip.routeId;
      if (promatraneLinije.includes(parseInt(routeId))) {
        const baseId = entity.id.split('_')[0];
        vehicles[baseId] = {
          id: entity.id,
          position: {
            lat: entity.vehicle.position.latitude,
            lon: entity.vehicle.position.longitude,
          },
        };

        // console.log(`[INFO] Vehicle data added for ${baseId}`);
      }
    }

    if (entity.tripUpdate && entity.tripUpdate.trip) {
      const routeId = entity.tripUpdate.trip.routeId;
      if (promatraneLinije.includes(parseInt(routeId))) {
        const baseId = entity.id;
        const lastStopUpdate = entity.tripUpdate.stopTimeUpdate.at(-1);
        if (lastStopUpdate) {
          const arrival = lastStopUpdate.arrival || {};
          const departure = lastStopUpdate.departure || {};

          stops[baseId] = {
            id: entity.id,
            tripId: entity.tripUpdate.trip.tripId,
            routeId: entity.tripUpdate.trip.routeId,
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
          };

          // console.log(`[INFO] Stop data added for ${baseId}`);
        }
      }
    }
  } catch (error) {
    console.error('[Error] Entity processing failed:', error.message);
    console.error('Entity causing the error:', JSON.stringify(entity, null, 2));
  }
}

module.exports = {
  fetchZetData,
};
