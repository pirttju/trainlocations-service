-- Train Locations data
CREATE TABLE trainlocations (
  id              bigint PRIMARY KEY,
  description     text,
  train_number    text,
  departure_date  date,
  vehicle_id      text,
  speed           smallint,
  bearing         smallint,
  geom            geometry(Point,4326) NOT NULL,
  data_source     text,
  timestamp       timestamptz DEFAULT CURRENT_TIMESTAMP
);


CREATE OR REPLACE FUNCTION train_category(train_type text) RETURNS text AS
$$
BEGIN
    CASE
        WHEN train_type IN ('VET', 'VEV', 'VLI') THEN
            RETURN 'loco';
        WHEN train_type IN ('MUS', 'MUV', 'V') THEN
            RETURN 'regional';
        WHEN train_type IN ('MV', 'SAA', 'HV', 'W') THEN
            RETURN 'ecs';
        WHEN train_type IN ('H', 'HDM', 'HSM') THEN
            RETURN 'regional';
        WHEN train_type IN ('TYO', 'LIV') THEN
            RETURN 'work';
        WHEN train_type IN ('T', 'RJ', 'PAI', 'PAR') THEN
            RETURN 'freight';
        WHEN train_type IN ('P', 'PYO', 'IC', 'IC2', 'S', 'AE', 'PVS', 'PVV') THEN
            RETURN 'intercity';
        WHEN train_type IN ('HL', 'HLV') THEN
            RETURN 'regional';
        ELSE
            RETURN 'other';
    END CASE;
END;
$$
LANGUAGE plpgsql;


-- Bearing is not supplied from Kupla (Digitraffic) so we have to calculate it from coords
CREATE OR REPLACE FUNCTION trainlocations_set_bearing() RETURNS TRIGGER AS
$$
BEGIN
    IF (NEW."data_source" IN ('NROD', 'KUPLA') AND ST_Equals(OLD.geom, NEW.geom)) THEN
        NEW."bearing" := OLD."bearing";
    ELSIF (NEW."data_source" IN ('NROD', 'KUPLA')) THEN
        NEW."bearing" := round(ST_Azimuth(OLD."geom", NEW."geom")/(2*pi())*360);
    END IF;
    RETURN NEW;
END
$$
LANGUAGE plpgsql;

CREATE TRIGGER trainlocations_set_bearing
BEFORE UPDATE ON trainlocations
FOR EACH ROW EXECUTE PROCEDURE trainlocations_set_bearing();
