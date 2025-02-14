WITH cte AS (
  SELECT 
    su.id, 
    su.tripid, 
    su.stopid,
    su.currentstopsequence, 
    su.arrivedat, 
    su.reporteddelay,
    jsonb_build_object('latitude', s.stop_lat, 'longitude', s.stop_lon) AS nextstoplocation,
    LEAD(arrivedat) OVER (PARTITION BY id, tripid ORDER BY arrivedat) AS nextarrivaltime
  FROM stopupdates su
  JOIN stop_times st 
    ON su.tripid = st.trip_id 
   AND su.currentstopsequence = (st.stop_sequence - 1)
  JOIN stops s 
    ON su.stopid = s.stop_id
	WHERE EXTRACT(YEAR FROM arrivedat) != 1970
  ORDER BY arrivedat
),
cte_vehicle_updates AS (
  SELECT 
    cte.*, 
    vu.timestamp AS vehicletimestamp, 
    vu.position AS vehicleposition,
		ST_SetSRID(ST_MakePoint((vu.position->>'longitude')::double precision, (vu.position->>'latitude')::double precision), 4326) AS vehicle_geom
  FROM cte
  JOIN vehicleupdates vu 
    ON cte.id = SPLIT_PART(vu.id, '_', 1)
   AND cte.tripid = vu.tripid
   AND vu.timestamp >= cte.arrivedat 
   AND (cte.nextarrivaltime IS NULL OR vu.timestamp < cte.nextarrivaltime)
),
cte_traffic AS (
SELECT c.*, t.currentspeed, t.freeflowspeed, t.currenttraveltime, t.freeflowtraveltime, t.roadclosure
FROM cte_vehicle_updates c
JOIN LATERAL (
  SELECT t.*
  FROM trafficdata t
  WHERE 
    (c.vehicleposition->>'latitude')::double precision = (t.coordinates->>'latitude')::double precision
    AND (c.vehicleposition->>'longitude')::double precision = (t.coordinates->>'longitude')::double precision
  ORDER BY ABS(EXTRACT(EPOCH FROM (t.timestamp - c.vehicletimestamp))) ASC
  LIMIT 1
) t ON true
)
SELECT c.vehicletimestamp::TIME AS start_time,
	(c.reporteddelay::double precision / 900) AS normalized_delay,
	(c.currentspeed::double precision / c.freeflowspeed::double precision) AS normalized_speed,
	CASE 
        WHEN c.roadclosure THEN 1
        ELSE 0
  END AS road_closed,
	(w.temp + 20) / 70 AS normalized_temperature, 
	(w.vlaga::double precision / 100) AS normalized_humidity,
	(w.vjetarbrzina / 60) AS normalized_windspeed,
	ST_Distance(
        ST_SetSRID(ST_MakePoint(
            (c.vehicleposition->>'longitude')::double precision, 
            (c.vehicleposition->>'latitude')::double precision
        )::geography, 4326),
        ST_SetSRID(ST_MakePoint(
            (c.nextstoplocation->>'longitude')::double precision, 
            (c.nextstoplocation->>'latitude')::double precision
        )::geography, 4326)
    ) / 8000 AS normalized_distance,
		c.nextarrivaltime::TIME AS end_time
FROM cte_traffic c
JOIN LATERAL (
  SELECT w.*, ST_Distance(
      ST_SetSRID(ST_MakePoint((w.lon)::double precision, (w.lat)::double precision), 4326),
      c.vehicle_geom
    ) AS distance
  FROM weatherdata w
  WHERE w.termin = EXTRACT(HOUR FROM c.vehicletimestamp)
	ORDER BY distance ASC
  LIMIT 1
) w ON true
WHERE c.nextarrivaltime IS NOT NULL

