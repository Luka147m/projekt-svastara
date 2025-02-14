const express = require('express');
const app = express();

const { fetchZetData } = require('./fetchZetData');
const { fetchWeatherData } = require('./fetchWeather');

var zetData;

async function fetchAndRefreshData() {
  try {
    await fetchZetData();
    console.log('[INFO] Inital data downloaded');
  } catch (error) {
    console.error(error);
  }
  setInterval(async () => {
    try {
      await fetchZetData();
    } catch (error) {
      console.error('[ERROR] Refreshing data:', error);
    }
  }, 10000); // 10 sekundi
}

app.get('/', async (req, res) => {
  res.json(zetData);
});

async function startServer() {
  fetchAndRefreshData();
  fetchWeatherData();
  setInterval(fetchWeatherData, 3600000);

  app.listen(8080, () => {
    console.log('[INFO] Server started on port 8080');
  });
}

startServer();
