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

function upsert(data) {
  return db.tx('upsert-train-locations', t => {
    const queries = [];

    for (const train of data) {
      queries.push(t.trainLocations.upsert(train));
    }

    return t.batch(queries);
  });
}

/*
{
  VP: {
    desi: '4',
    dir: '1',
    oper: 40,
    veh: 457,
    tst: '2021-04-18T13:56:51.839Z',
    tsi: 1618754211,
    spd: 0,
    hdg: 264,
    lat: 60.168841,
    long: 24.941988,
    acc: 0,
    dl: 76,
    odo: 2011,
    drst: 1,
    oday: '2021-04-18',
    jrn: 1747,
    line: 32,
    start: '16:50',
    loc: 'GPS',
    stop: 1020447,
    route: '1004',
    occu: 0
  }
}
*/

class HSL {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.dataSource = 'HSL';
    this.resolution = 3000;
    this.timer = null;
    this.messages = {};
  }

  onMessage(data) {
    if (data.VP && data.VP.long && data.VP.lat) {
      const id = parseInt(`99${data.VP.oper}${data.VP.veh}`);
      const geom = new STPoint(data.VP.long, data.VP.lat);
  
      const msg = {
        'id': id,
        'description': data.VP.desi,
        'train_number': data.VP.jrn,
        'departure_date': data.VP.oday,
        'vehicle_id': data.VP.veh,
        'speed': data.VP.spd,
        'bearing': data.VP.hdg,
        'geom': geom,
        'data_source': 'OXYFI',
        'timestamp': data.VP.tst
      };

      // Cache this message
      this.messages[id] = msg;
    }
  }

  onLoop() {
    upsert(Object.values(this.messages));

    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }

  onConnected() {
    console.log(`[HSL] Connected`);
    this.client.subscribe('/hfp/v2/journey/ongoing/vp/tram/#');
    this.client.subscribe('/hfp/v2/journey/ongoing/vp/metro/#');
  }

  connect() {
    console.log(`[HSL] Connecting to ${this.url}...`);
    
    this.client = mqtt.connect(this.url);
    
    this.client.on('connect', () => this.onConnected());

    this.client.on('close', () => console.log('[HSL] Disconnected'));

    this.client.on('reconnect', () => console.log('[HSL] Reconnecting...'));

    this.client.on('error', error => console.log(`[HSL] Error: ${error}`));

    this.client.on('message', (topic, payload) => {
      let json = {};

      try {
        json = JSON.parse(payload.toString());
      } catch (error) {
        return;
      }

      this.onMessage(json);
    });

    // Start timer
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }
}

module.exports = HSL;