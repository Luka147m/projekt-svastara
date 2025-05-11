const xml2js = require('xml2js');

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
  } catch (error) {
    console.error('Error fetching or parsing the weather data:', error);
  }
};

module.exports = { fetchWeatherData };
