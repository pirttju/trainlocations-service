const fs = require("fs");
const mqtt = require("mqtt");
const { db, pgp } = require("../db");
const nrod_berth = JSON.parse(fs.readFileSync("data/nrod_berth.json", "utf8"));
const regex = /^[0-9][A-Z][0-9]{2}$/;

const makePoint = (e) => {
  const b = nrod_berth.find(
    (b) => b.area_id === e.area_id && b.berth_id === e.to
  );

  if (!b) {
    return;
  }

  return [Number(b.latitude), Number(b.longitude)];
};

class STPoint {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.rawType = true;
  }

  toPostgres(self) {
    return pgp.as.format("ST_SetSRID(ST_MakePoint($1, $2), 4326)", [
      this.x,
      this.y,
    ]);
  }
}

class NROD {
  constructor(url) {
    this.url = url;
    this.client = null;
    this.dataSource = "NROD";
  }

  parse(e) {
    try {
      if (!regex.test(e.descr)) {
        return;
      }

      const r = {};

      r.id = `nrod:${e.area_id}:${e.descr}`;
      r.point = makePoint(e);

      if (!r.point) {
        return;
      }

      const ts = new Date(parseInt(e.time));

      r.fields = {
        properties: {
          id: r.id,
          ts: ts,
          tn: e.descr,
        },
      };
      return r;
    } catch (error) {
      console.error(`nrod: parser error ${error}`);
    }
  }

  onMessage(message) {
    db.tx((t) => {
      const queries = [];
      for (const msg of message) {
        if (msg.CA_MSG) {
          // Step, move into location
          const data = this.parse(msg.CA_MSG);
          if (!data) {
            // possibly stepped out of area => remove from area
            const delId = `nrod:${msg.CA_MSG.area_id}:${msg.CA_MSG.descr}`;
            // sql delete
            queries.push(db.trainLocations.delete(delId));
          } else {
            // set location
            // sql upsert
            const geom = new STPoint(data.point[1], data.point[0]);
            queries.push(
              db.trainLocations.upsert({
                id: data.fields.properties.id,
                description: data.fields.properties.tn,
                train_number: data.fields.properties.tn,
                departure_date: null,
                vehicle_id: null,
                speed: 0,
                bearing: 0,
                geom: geom,
                data_source: this.dataSource,
                timestamp: data.fields.properties.ts,
              })
            );
          }
        } else if (msg.CB_MSG) {
          // Cancel, remove from location
          const delId = `nrod:${msg.CB_MSG.area_id}:${msg.CB_MSG.descr}`;
          // sql delete
          queries.push(db.trainLocations.delete(delId));
        } else if (msg.CC_MSG) {
          // Interpose, place into location
          const data = this.parse(msg.CC_MSG);
          if (!data) continue;
          // sql upsert
          const geom = new STPoint(data.point[1], data.point[0]);
          queries.push(
            db.trainLocations.upsert({
              id: data.fields.properties.id,
              description: data.fields.properties.tn,
              train_number: data.fields.properties.tn,
              departure_date: null,
              vehicle_id: null,
              speed: 0,
              bearing: 0,
              geom: geom,
              data_source: this.dataSource,
              timestamp: data.fields.properties.ts,
            })
          );
        }
      }

      return t.batch(queries);
    });
  }

  onConnected() {
    console.log(`[NROD] Connected`);
    this.client.subscribe("TD_ALL_SIG_AREA/#");
  }

  connect() {
    console.log(`[NROD] Connecting to ${this.url}...`);
    this.client = mqtt.connect(this.url);

    this.client.on("connect", () => this.onConnected());

    this.client.on("close", () => console.log("[NROD] Disconnected"));

    this.client.on("reconnect", () => console.log("[NROD] Reconnecting..."));

    this.client.on("error", (error) => console.log(`[NROD] Error: ${error}`));

    this.client.on("message", (topic, payload) => {
      let json = {};

      try {
        json = JSON.parse(payload.toString());
      } catch (error) {
        return;
      }

      this.onMessage(json);
    });
  }
}

module.exports = NROD;
