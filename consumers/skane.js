const GtfsRealtimeBindings = require('gtfs-realtime-bindings');
const needle = require('needle');
const {db, pgp} = require('../db');

/*
FeedEntity {
  id: '303151869',
  vehicle: VehiclePosition {
    trip: TripDescriptor {
      tripId: '55700000059425160',
      scheduleRelationship: 0
    },
    position: Position {
      latitude: 58.383602142333984,
      longitude: 15.433151245117188,
      bearing: 54,
      speed: 0.30000001192092896
    },
    timestamp: Long { low: 1617829605, high: 0, unsigned: true },
    vehicle: VehicleDescriptor { id: '9031005901461208' }
  }
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

class Skanetrafiken {
  constructor(url) {
    this.url = url;
    this.resolution = 90000;
    this.timer = null;
    this.dataSource = 'SKANE';
  }

  onMessage(data) {
    if (data.vehicle && data.vehicle.position && data.vehicle.timestamp) {
      // the vehicle id is really combination of route id and train number
      const vehicleId = data.vehicle.vehicle.id;

      // dirty filter other than Öresundståg/Pågatåg routes
      if (
        !(
          vehicleId.startsWith('9031012080') ||
          vehicleId.startsWith('9031012081') ||
          vehicleId.startsWith('9031012082')
        )
      ) return;

      const departureDate = new Date().toISOString().slice(0, 10); // FIXME not always correct
      const trainNumber = +(vehicleId.substr(vehicleId.length - 5));

      const id = (`74${departureDate}${trainNumber}`).replace(/\D+/g, '');

      const geom = new STPoint(data.vehicle.position.longitude, data.vehicle.position.latitude);
      const timestamp = new Date(data.vehicle.timestamp.low * 1000);

      const speed = data.vehicle.position.speed * 3.6;
      const bearing = data.vehicle.position.bearing;

      return db.trainLocations.upsert({
        'id': id,
        'description': trainNumber,
        'train_number': trainNumber,
        'departure_date': departureDate,
        'vehicle_id': null,
        'speed': speed,
        'bearing': bearing,
        'geom': geom,
        'data_source': 'SKANE',
        'timestamp': timestamp
      });
    }
  }

  onLoop() {
    needle('get', this.url, { compressed: true })
    .then((response) => {
      const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(response.body);

      for(let i = 0; i < feed.entity.length; i++) {
        this.onMessage(feed.entity[i]);
      }

      clearTimeout(this.timer);
      this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
    })
    .catch((error) => {
      console.log(`[GTFS-RT ${this.dataSource}] Error: ${error}`);

      clearTimeout(this.timer);
      this.timer = setTimeout(this.onLoop.bind(this), this.resolution * 3);
    });
  }

  start() {
    console.log(`[GTFS-RT ${this.dataSource}] Starting...`);
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }
}

module.exports = Skanetrafiken;