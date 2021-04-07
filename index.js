const dotenv = require('dotenv').config();
const Digitraffic = require('./consumers/digitraffic');
const Oxyfi = require('./consumers/oxyfi');

const blacklist = require('./blacklist.json');
const vehicles = require('./vehicles.json');

function run() {
  const digitraffic = new Digitraffic('mqtt://rata-mqtt.digitraffic.fi');
  digitraffic.connect();

  const oxyfi = new Oxyfi(`wss://api.oxyfi.com/trainpos/listen?v=1&key=${process.env.OXYFI_API_KEY}`, vehicles, blacklist);
  oxyfi.connect();
}

run();