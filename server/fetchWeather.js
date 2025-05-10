const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const apiKey = process.env.WEATHER_API_KEY;

async function fetchWeather({ lat, lon }) {
  const apiUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  try {
    const response = await axios.get(apiUrl);
    // console.log('Weather data:', response.data);
    let weatherType = response.data.weather[0].id;
    let weatherConditions = response.data.weather[0].main;
    let temperature = response.data.main.temp;
    let feelsLike = response.data.main.feels_like;
    let pressure = response.data.main.pressure;
    let humidity = response.data.main.humidity;
    let windSpeed = response.data.wind.speed;
    let snow = response.data.snow ? response.data.snow['1h'] : 0;
    let rain = response.data.rain ? response.data.rain['1h'] : 0;

    let formattedResponse = {
      weatherType,
      weatherConditions,
      temperature,
      feelsLike,
      pressure,
      humidity,
      windSpeed,
      snow,
      rain,
    };

    // console.log('Formatted weather data:', formattedResponse);

    return formattedResponse;
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
    throw error;
  }
}

// fetchWeather({ lat: 45.541914470078034, lon: 11.477084301109421 });

module.exports = { fetchWeather };
