const dotenv = require("dotenv").config();

const Digitraffic = require("./consumers/digitraffic");
const HSL = require("./consumers/hsl");
const Oxyfi = require("./consumers/oxyfi");
const GtfsRealtime = require("./consumers/gtfs-rt");
//const Skanetrafiken = require('./consumers/skane');
const Trafikverket = require("./consumers/trafikverket");
const Cleaner = require("./consumers/cleaner");

// blacklist to filter non-rail vehicles
const blacklist = require("./blacklist.json");

// vehicle data mapping to real types and numbers
const vehicles = require("./vehicles.json");

function run() {
  const digitraffic = new Digitraffic("mqtt://rata-mqtt.digitraffic.fi");
  digitraffic.connect();

  const hsl = new HSL("mqtt://mqtt.hsl.fi:1883");
  hsl.connect();

  const oxyfi = new Oxyfi(
    `wss://api.oxyfi.com/trainpos/listen?v=1&key=${process.env.OXYFI_API_KEY}`,
    vehicles,
    blacklist
  );
  oxyfi.connect();

  const nysse = new GtfsRealtime(
    "https://data.waltti.fi/tampere/api/gtfsrealtime/v1.0/feed/vehicleposition",
    process.env.WALTTI_API_KEY,
    vehicles,
    {},
    "NYSSE"
  );
  nysse.start();

  // Östgötatrafiken GTFS-RT
  //const otraf = new GtfsRealtime(`https://opendata.samtrafiken.se/gtfs-rt/otraf/VehiclePositions.pb?key=${process.env.GTFS_RT_API_KEY}`,
  //  null, vehicles, blacklist, 'OTRAF');
  //otraf.start();

  // Skånetrafiken (GTFS-RT but with train numbers as vehicle id)
  //const skane = new Skanetrafiken(`https://opendata.samtrafiken.se/gtfs-rt/skane/VehiclePositions.pb?key=${process.env.GTFS_RT_API_KEY}`);
  //skane.start();

  // Trafikverket TrainPosition
  const trafik = new Trafikverket(
    "https://api.trafikinfo.trafikverket.se/v2/data.json",
    process.env.TRAFIKVERKET_API_KEY
  );
  trafik.start();

  // Set Cleaner to work every 5 minutes
  const cleaner = new Cleaner(300000);
  cleaner.run(); // run run run
}

run();
