const dotenv = require('dotenv').config();
const Digitraffic = require('./consumers/digitraffic');
const Oxyfi = require('./consumers/oxyfi');

const blacklist = require('./blacklist.json');
const vehicles = require('./vehicles.json');
const GtfsRealtime = require('./consumers/gtfs-rt');

function run() {
  const digitraffic = new Digitraffic('mqtt://rata-mqtt.digitraffic.fi');
  digitraffic.connect();

  const oxyfi = new Oxyfi(`wss://api.oxyfi.com/trainpos/listen?v=1&key=${process.env.OXYFI_API_KEY}`,
    vehicles, blacklist);
  oxyfi.connect();

  // Skånetrafiken GTFS-RT
  const skane = new GtfsRealtime(`https://opendata.samtrafiken.se/gtfs-rt/skane/VehiclePositions.pb?key=${process.env.GTFS_RT_API_KEY}`,
    vehicles, blacklist, 'SKANE');
  skane.start();

  // Östgötatrafiken GTFS-RT
  const otraf = new GtfsRealtime(`https://opendata.samtrafiken.se/gtfs-rt/otraf/VehiclePositions.pb?key=${process.env.GTFS_RT_API_KEY}`,
  vehicles, blacklist, 'OTRAF');
  otraf.start();
}

run();