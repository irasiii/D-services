-- Starting catalogue. Fees and tariffs are placeholders the company can change through the API.
INSERT INTO service_types
  (id, name, description, pricing_mode, fee_type, fee_bps, fee_fixed_cents, base_fare_cents, per_km_cents, min_fare_cents)
VALUES
  ('courier',    'Courier and parcels', 'Point-to-point parcel delivery, any vehicle size',      'PLATFORM', 'PERCENTAGE', 1500,    0,  800, 150, 1200),
  ('food',       'Food delivery',       'Restaurant and grocery delivery',                       'PLATFORM', 'PERCENTAGE', 2000,    0,  500, 120,  700),
  ('rides',      'Rides',               'Passenger transport',                                   'PLATFORM', 'PERCENTAGE', 2000,    0,  400, 180,  900),
  ('removals',   'Removals',            'House and office moves',                                'BIDDING',  'PERCENTAGE', 1000,    0,    0,   0,    0),
  ('freight',    'Heavy freight',       'Big-truck transfers within and between states',         'BIDDING',  'FIXED',         0, 5000,    0,   0,    0),
  ('earthworks', 'Earth removal',       'Soil, fill and spoil removal with tippers',             'BIDDING',  'FIXED',         0, 4000,    0,   0,    0);
