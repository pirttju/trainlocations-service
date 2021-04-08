const mqtt = require('mqtt');
const {db, pgp} = require('../db');

/*
{
  "trainNumber":8734,
  "departureDate":"2021-04-05",
  "timestamp":"2021-04-05T19:29:19.000Z",
  "location": {
    "type":"Point",
    "coordinates": [
      24.848806,60.28524
    ]
  },
  "speed":55
}
*/

class STPoint {
  constructor(x, y) {
      this.x = x;
      this.y = y;
      this.rawType = true;
  }

  toPostgres(self) {
      return pgp.as.format('ST_SetSRID(ST_MakePoint($1, $2), 4326)', [this.x, this.y]);
  }
}

class Digitraffic {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.dataSource = 'KUPLA';
  }

  onMessage(data) {
    if (data.location && data.location.coordinates) {
      const id = (`10${data.departureDate}${data.trainNumber}`).replace(/\D+/g, '');
      const geom = new STPoint(data.location.coordinates[0], data.location.coordinates[1]);

      return db.trainLocations.upsert({
        'id': id,
        'description': data.trainNumber,
        'train_number': data.trainNumber,
        'departure_date': data.departureDate,
        'vehicle_id': null,
        'speed': parseInt(data.speed),
        'bearing': 0,
        'geom': geom,
        'data_source': this.dataSource,
        'timestamp': data.timestamp
      });
    }
  }

  onConnected() {
    console.log(`[Digitraffic] Subscribe topic train-locations/#`);
    this.client.subscribe('train-locations/#', (error) => {
      if (error) {
        console.log(`[Digitraffic] MQTT error: ${error}`);
        return;
      }

      console.log(`[Digitraffic] Connection established`);
    });
  }

  connect() {
    console.log(`[Digitraffic] Connecting to ${this.url}...`);
    this.client = mqtt.connect(this.url);

    this.client.on('connect', () => this.onConnected());

    this.client.on('message', (topic, payload) => {
      let json = {};

      try {
        json = JSON.parse(payload.toString());
      } catch (error) {
        return;
      }

      this.onMessage(json);
    });
  }
}

module.exports = Digitraffic;