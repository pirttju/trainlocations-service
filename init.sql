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

-- Bearing is not supplied from Kupla (Digitraffic) so we have to calculate it from coords
CREATE OR REPLACE FUNCTION trainlocations_set_bearing() RETURNS TRIGGER AS
$$
BEGIN
    IF (NEW."data_source" = 'KUPLA' AND ST_Equals(OLD.geom, NEW.geom)) THEN
        NEW."bearing" := OLD."bearing";
    ELSIF (NEW."data_source" = 'KUPLA') THEN
        NEW."bearing" := round(ST_Azimuth(OLD."geom", NEW."geom")/(2*pi())*360);
    END IF;
    RETURN NEW;
END
$$
LANGUAGE plpgsql;

CREATE TRIGGER trainlocations_set_bearing
BEFORE UPDATE ON trainlocations
FOR EACH ROW EXECUTE PROCEDURE trainlocations_set_bearing();