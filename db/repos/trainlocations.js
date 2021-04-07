const cs = {};

function createColumnsets(pgp) {
  if (!cs.insert) {
    cs.insert = new pgp.helpers.ColumnSet([
      'id',
      'description',
      'train_number',
      'departure_date',
      'vehicle_id',
      'speed',
      'bearing',
      'geom',
      'data_source',
      'timestamp'
    ], {table: {table: 'trainlocations', schema: 'public'}});
  }
}

class TrainLocationsRepository {
  constructor(db, pgp) {
    this.db = db;
    this.pgp = pgp;
    createColumnsets(pgp);
  }

  async insert(data) {
    const query = this.pgp.helpers.insert(data, cs.insert);
    return this.db.none(query);
  }

  async upsert(data) {
    const query = this.pgp.helpers.insert(data, cs.insert) +
      ' ON CONFLICT (id) DO UPDATE SET ' +
      cs.insert.assignColumns({from: 'excluded', skip: ['id']});
    return this.db.none(query);
  }

  async delete(id) {
    return this.db.result(
      'DELETE FROM trainlocations WHERE id = $1',
      [id], r => r.rowCount);
  }
}

module.exports = TrainLocationsRepository;