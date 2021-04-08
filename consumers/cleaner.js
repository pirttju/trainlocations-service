const {db, pgp} = require('../db');

class Cleaner {
  constructor(ttl) {
    this.ttl = ttl;
    this.timer = null;
  }

  run() {
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.ttl);
  }

  onLoop() {
    clearTimeout(this.timer);
    this.timer = setTimeout(this.onLoop.bind(this), this.ttl);

    // Remove old records periodically
    return db.trainLocations.removeOld();
  }
}

module.exports = Cleaner;