const mqtt = require('mqtt');
const {db, pgp} = require('../db');

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

class HSL {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.dataSource = 'HSL';
  }

  onMessage(data) {
    console.log(data);

    return;

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
    console.log(`[HSL] Subscribe topics`);

    this.client.subscribe('/hpf/v2/+/+/vp/tram/#', (error) => {
      if (error) {
        console.log(`[HSL] MQTT error: ${error}`);
        return;
      }

      console.log(`[HSL] Listening trams`);
    });
  }

  connect() {
    console.log(`[HSL] Connecting to ${this.url}...`);
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

module.exports = HSL;