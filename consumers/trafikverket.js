const needle = require("needle");
const { db, pgp } = require("../db");

class WKTPoint {
  constructor(wkt) {
    this.wkt = wkt;
    this.rawType = true;
  }

  toPostgres(self) {
    return pgp.as.format("ST_GeomFromText($1, 4326)", [this.wkt]);
  }
}

class Trafikverket {
  constructor(url, auth) {
    this.url = url;
    this.auth = auth;
    this.resolution = 15000;
    this.timer = null;
    this.dataSource = "TRAFIKVERKET";
    this.lastTime = new Date().toISOString();
  }

  onMessage(data) {
    if (data.Train && data.Position && data.Position.WGS84) {
      const dep = data.Train.OperationalTrainDepartureDate.substring(0, 10);
      const train = data.Train.AdvertisedTrainNumber;

      // print some debug information if no train number
      if (!train) {
        console.log(`[${this.dataSource}] No Train Number! Data: ${data}`);
        return;
      }

      const id = `74${dep}${train}`.replace(/\D+/g, "");

      const geom = new WKTPoint(data.Position.WGS84);

      return db.trainLocations.upsert({
        id: id,
        description: train,
        train_number: train,
        departure_date: dep,
        vehicle_id: null,
        speed: data.Speed || 0,
        bearing: data.Bearing || 0,
        geom: geom,
        data_source: this.dataSource,
        timestamp: data.ModifiedTime || new Date().toISOString(),
      });
    }
  }

  onLoop() {
    const params = `<GT name="ModifiedTime" value="${this.lastTime}" />`; //
    const filter = `<FILTER>${params}</FILTER>`;
    const query = `<QUERY namespace="järnväg.trafikinfo" objecttype="TrainPosition" schemaversion="1.0">${filter}</QUERY>`;
    const data = `<REQUEST><LOGIN authenticationkey="${this.auth}" />${query}</REQUEST>`;

    const options = {
      compressed: true,
      headers: {
        "Content-Type": "application/xml",
      },
      json: true,
    };

    needle("post", this.url, data, options)
      .then((resp) => {
        if (resp.body.RESPONSE !== null && resp.body.RESPONSE.RESULT !== null) {
          const result = resp.body.RESPONSE.RESULT[0];
          if (result.TrainPosition !== null) {
            for (let i = 0; i < result.TrainPosition.length; i++) {
              this.onMessage(result.TrainPosition[i]);
            }
          }
        }

        clearTimeout(this.timer);
        this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
        this.lastTime = new Date().toISOString();
      })
      .catch((error) => {
        console.log(`[${this.dataSource}] Error: ${error}`);

        clearTimeout(this.timer);
        this.timer = setTimeout(this.onLoop.bind(this), this.resolution * 5);
      });
  }

  start() {
    console.log(`[${this.dataSource}] Starting...`);
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.resolution);
  }
}

module.exports = Trafikverket;
