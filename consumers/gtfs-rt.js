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
  constructor(url, auth, vehicles, blacklist, dataSource) {
    this.url = url;
    this.auth = auth;
    this.vehicles = vehicles;
    this.blacklist = blacklist;
    this.dataSource = dataSource;
    this.resolution = 5000;
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
    if (data.vehicle && data.vehicle.position && data.vehicle.timestamp && data.vehicle.vehicle) {
      // vehicle id
      const vehicleId = this.getVehicle(data.vehicle.vehicle.id);

      // dirty filter to show rail-vehicles only
      if (
        !(
          data.vehicle.vehicle.id.startsWith('903100590146') ||
          vehicleId !== data.vehicle.vehicle.id
        )
      ) return;

      const id = (`9999${data.vehicle.vehicle.id}`).replace(/\D+/g, '');

      const geom = new STPoint(data.vehicle.position.longitude, data.vehicle.position.latitude);
      const timestamp = new Date(data.vehicle.timestamp.low * 1000);

      let description = `(${vehicleId})`;

      let tripId = null;
      if (data.vehicle.trip) {
        tripId = data.vehicle.trip.tripId;

        if (data.vehicle.trip.routeId) {
          description = data.vehicle.trip.routeId;
        }
      }

      if (this.dataSource === 'NYSSE') {
        description = description.replace('56920', '');
        if (data.vehicle.vehicle.label) {
          description += ' ' + data.vehicle.vehicle.label;
        }
      }

      const speed = data.vehicle.position.speed * 3.6;
      const bearing = data.vehicle.position.bearing;      

      return db.trainLocations.upsert({
        'id': id,
        'description': description,
        'train_number': tripId,
        'departure_date': null,
        'vehicle_id': vehicleId,
        'speed': speed,
        'bearing': bearing,
        'geom': geom,
        'data_source': this.dataSource,
        'timestamp': timestamp
      });
    }
  }

  onLoop() {
    let headers = {};
    if (this.auth) {
      headers = {
        'Authorization' : `Basic ${this.auth}`
      }
    }
    needle('get', this.url, { headers: headers, compressed: true })
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

module.exports = GtfsRealtime;
