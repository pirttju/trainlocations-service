const dotenv = require('dotenv').config();

const Digitraffic = require('./consumers/digitraffic');
const Oxyfi = require('./consumers/oxyfi');
const GtfsRealtime = require('./consumers/gtfs-rt');
const Skanetrafiken = require('./consumers/skane');
const Cleaner = require('./consumers/cleaner');

// blacklist to filter non-rail vehicles
const blacklist = require('./blacklist.json');

// vehicle data mapping to real types and numbers
const vehicles = require('./vehicles.json');

function run() {
  const digitraffic = new Digitraffic('mqtt://rata-mqtt.digitraffic.fi');
  digitraffic.connect();

  const oxyfi = new Oxyfi(`wss://api.oxyfi.com/trainpos/listen?v=1&key=${process.env.OXYFI_API_KEY}`,
    vehicles, blacklist);
  oxyfi.connect();

  // Östgötatrafiken GTFS-RT
  const otraf = new GtfsRealtime(`https://opendata.samtrafiken.se/gtfs-rt/otraf/VehiclePositions.pb?key=${process.env.GTFS_RT_API_KEY}`,
    vehicles, blacklist, 'OTRAF');
  otraf.start();

  // Skånetrafiken (GTFS-RT but with train numbers as vehicle id)
  //const skane = new Skanetrafiken(`https://opendata.samtrafiken.se/gtfs-rt/skane/VehiclePositions.pb?key=${process.env.GTFS_RT_API_KEY}`);
  //skane.start();

  // Set Cleaner to work every 5 minutes
  const cleaner = new Cleaner(300000);
  cleaner.run(); // run run run
}

run();