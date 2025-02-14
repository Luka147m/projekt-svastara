const xml2js = require('xml2js');
const { pool } = require('./db');

const fetchWeatherData = async () => {
  const url = 'https://vrijeme.hr/hrvatska_n.xml';

  try {
    console.log(`[INFO] Fetching new weather data from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`[ERROR] HTTP error! status: ${response.status}`);
    }

    const xml = await response.text();

    const parser = new xml2js.Parser();
    const jsonData = await parser.parseStringPromise(xml);

    // console.log('[DEBUG] Parsed JSON data:', JSON.stringify(jsonData, null, 2));

    const termin = parseInt(jsonData.Hrvatska.DatumTermin[0].Termin);
    const date = jsonData.Hrvatska.DatumTermin[0].Datum;

    const gradovi = Array.isArray(jsonData.Hrvatska.Grad)
      ? jsonData.Hrvatska.Grad
      : [jsonData.Hrvatska.Grad];

    // console.log('[INFO] Fetched weather data:', gradovi);

    const zagrebData = gradovi
      .filter((grad) => grad.GradIme[0].trim().toLowerCase().includes('zagreb'))
      .map((grad) => ({
        termin,
        date,
        gradime: grad.GradIme[0].trim(),
        lat: parseFloat(grad.Lat[0]),
        lon: parseFloat(grad.Lon[0]),
        podatci: {
          temp: parseFloat(grad.Podatci[0].Temp[0]),
          vlaga: parseInt(grad.Podatci[0].Vlaga[0], 10),
          tlak: parseFloat(grad.Podatci[0].Tlak[0]),
          tlaktend: parseFloat(grad.Podatci[0].TlakTend[0]),
          vjetarsmjer: grad.Podatci[0].VjetarSmjer[0].trim(),
          vjetarbrzina: parseFloat(grad.Podatci[0].VjetarBrzina[0]),
          vrijeme: grad.Podatci[0].Vrijeme[0].trim(),
          vrijemeznak: parseInt(grad.Podatci[0].VrijemeZnak[0], 10),
        },
      }));

    // console.log('[INFO] Processed weather data:', zagrebData);

    await insertWeatherData(zagrebData);
  } catch (error) {
    console.error('Error fetching or parsing the weather data:', error);
  }
};

const insertWeatherData = async (data) => {
  const client = await pool.connect();

  try {
    const query = `
        INSERT INTO weatherdata (
          termin, date, gradime, lat, lon, temp, vlaga, tlak, tlaktend, vjetarsmjer, vjetarbrzina, vrijeme, vrijemeznak
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (termin, date, gradime) DO NOTHING;
      `;

    for (const grad of data) {
      const values = [
        grad.termin,
        grad.date,
        grad.gradime,
        grad.lat,
        grad.lon,
        grad.podatci.temp,
        grad.podatci.vlaga,
        grad.podatci.tlak,
        grad.podatci.tlaktend,
        grad.podatci.vjetarsmjer,
        grad.podatci.vjetarbrzina,
        grad.podatci.vrijeme,
        grad.podatci.vrijemeznak,
      ];

      await client.query(query, values);
    }

    console.log('[INFO] Weather data inserted successfully!');
  } catch (err) {
    console.error('[ERROR] Error inserting weather data:', err);
  } finally {
    client.release();
  }
};

module.exports = { fetchWeatherData };
