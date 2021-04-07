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

class GtfsRealtime {
  constructor(url, vehicles, blacklist, provider) {
    this.url = url;
    this.vehicles = vehicles;
    this.blacklist = blacklist;
    this.provider = provider;
    this.resolution = 45000;
    this.timer = null;
  }

  getVehicle(id) {
    if (this.vehicles.hasOwnProperty(id)) {
      return this.vehicles[id];
    } else {
      return id;
    }
  }

  onMessage(data) {
    if (data.vehicle && data.vehicle.position && data.vehicle.timestamp) {
      // vehicle id
      const vehicleId = this.getVehicle(data.vehicle.vehicle.id);

      // dirty filter other than rail-vehicles
      if (
        !(
          vehicleId.startsWith('903100590146') ||
          vehicleId.startsWith('903101208') ||
          vehicleId.startsWith('X')
        )
      ) return;

      const id = (`74${vehicleId}`).replace(/\D+/g, '');

      const geom = new STPoint(data.vehicle.position.longitude, data.vehicle.position.latitude);
      const timestamp = new Date(data.vehicle.timestamp.low * 1000);

      let tripId = null;
      if (data.vehicle.trip) {
        tripId = data.vehicle.trip.tripId;
      }

      return db.trainLocations.upsert({
        'id': id,
        'description': `(${vehicleId})`,
        'train_number': tripId,
        'departure_date': null,
        'vehicle_id': vehicleId,
        'speed': +data.vehicle.position.speed,
        'bearing': +data.vehicle.position.bearing,
        'geom': geom,
        'data_source': this.provider,
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
      console.log(`[GTFS-RT ${this.provider}] Error: ${error}`);

      clearTimeout(this.timer);
      this.timer = setTimeout(this.onLoop.bind(this), this.resolution * 3);
    });
  }

  start() {
    console.log(`[GTFS-RT ${this.provider}] Starting...`);
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }
}

module.exports = GtfsRealtime;