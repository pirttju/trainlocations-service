//const NodeCache = require('node-cache');
const WebSocket = require('ws');
const {db, pgp} = require('../db');

function convertDMSToDD(d, m) {
  const days = parseInt(d);
  if (Number.isNaN(days)) return null;

  const minutes = parseFloat(m);

  var dd = days + minutes / 60;
  return dd;
}

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

function upsert(data) {
  return db.tx('upsert-train-locations', t => {
    const queries = [];

    for (const train of data) {
      queries.push(t.trainLocations.upsert(train));
    }

    return t.batch(queries);
  });
}

class Oxyfi {
  constructor(url, vehicles, blacklist) {
    this.url = url;
    this.ws = null;
    this.vehicles = vehicles;
    this.blacklist = blacklist;
    this.resolution = 3000;
    this.timer = null;
    this.messages = {};
    this.reconnectInterval = 60000;
    this.reconnectTimer = null;
  }

  getVehicle(id) {
    if (this.vehicles.hasOwnProperty(id)) {
      return this.vehicles[id];
    } else {
      return id;
    }
  }

  onMessage(csv) {
    // Quick and dirty parser for NMEA v2.2 string
    const data = String(csv).split(',');

    // Check for vehicle description
    if (!data[14]) return;

    // Block some non-rail vehicles
    if (this.blacklist.hasOwnProperty(data[14])) return;

    // Check for offline sensors or missing coordinates
    if (data[2] !== 'A' || +data[3] === 0 || +data[5] === 0) return;

    // Parse train number
    let tn, dd;

    if (data[16]) {
      const trainData = data[16].split(';')[0];

      tn = trainData.split('.')[0];
      dd = trainData.split('@')[1];
    }

    const trainNumber = Boolean(tn) ? tn : null;
    const departureDate = Boolean(dd) ? dd : null;

    const speed = data[7] * 1.852; // convert from knots
    const bearing = +data[8];

    const latitude = convertDMSToDD(data[3].substring(0, 2), data[3].substring(2));
    const longitude = convertDMSToDD(data[5].substring(0, 3), data[5].substring(3));

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) return;

    const geom = new STPoint(longitude, latitude);

    const vehicleId = this.getVehicle(data[14]);
    const id = (`74${vehicleId}`).replace(/\D+/g, '');

    // Parse time and date
    const rawTime = data[1].split('.');

    const datePart = ('000000' + data[9]).slice(-6);
    const timePart = ('000000' + rawTime[0]).slice(-6);

    let millis = 0;
    if (rawTime.length > 1) {
      millis = rawTime[1];
    }

    const timestamp = new Date(Date.UTC(
      +('20' + datePart.substring(4, 6)),
      (+datePart.substring(2, 4)) - 1,
      +datePart.substring(0, 2),
      +timePart.substring(0, 2),
      +timePart.substring(2, 4),
      +timePart.substring(4, 6),
      +millis
    ));

    const msg = {
      'id': id,
      'description': trainNumber ? trainNumber : `(${vehicleId})`,
      'train_number': +trainNumber,
      'departure_date': departureDate,
      'vehicle_id': vehicleId,
      'speed': speed,
      'bearing': bearing,
      'geom': geom,
      'data_source': 'OXYFI',
      'timestamp': timestamp
    };

    // Cache this message
    this.messages[id] = msg;
  }

  onLoop() {
    upsert(Object.values(this.messages));

    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }

  connect() {
    console.log(`[Oxyfi] Connecting to server...`);
    this.ws = new WebSocket(this.url);

    this.ws.on('open', () => {
      console.log(`[Oxyfi] Connection established.`);
    });

    this.ws.on('error', (error) => {
      console.log(`[Oxyfi] WebSocket error: ${error}`);
    });

    // auto reconnect on close
    this.ws.on('close', () => {
      console.log('[Oxyfi] WebSocket closed. Reconnecting in 60 sec...');
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(this.connect.bind(this), this.reconnectInterval);
    });

    this.ws.on('message', (data) => this.onMessage(data));

    // Start timer
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }
}

module.exports = Oxyfi;
