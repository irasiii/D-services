-- Core platform schema. Money is stored as integer cents.

CREATE TABLE service_types (
  id               text PRIMARY KEY,                 -- e.g. 'courier'
  name             text NOT NULL,
  description      text NOT NULL DEFAULT '',
  pricing_mode     text NOT NULL CHECK (pricing_mode IN ('PLATFORM', 'BIDDING')),
  fee_type         text NOT NULL CHECK (fee_type IN ('PERCENTAGE', 'FIXED')),
  fee_bps          integer NOT NULL DEFAULT 0 CHECK (fee_bps BETWEEN 0 AND 10000),
  fee_fixed_cents  integer NOT NULL DEFAULT 0 CHECK (fee_fixed_cents >= 0),
  base_fare_cents  integer NOT NULL DEFAULT 0 CHECK (base_fare_cents >= 0),
  per_km_cents     integer NOT NULL DEFAULT 0 CHECK (per_km_cents >= 0),
  min_fare_cents   integer NOT NULL DEFAULT 0 CHECK (min_fare_cents >= 0),
  active           boolean NOT NULL DEFAULT true
);

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL UNIQUE,
  phone       text,
  status      text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'BLOCKED')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE providers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  email           text NOT NULL UNIQUE,
  phone           text,
  business_number text,                               -- ABN
  licence_number  text NOT NULL,
  licence_class   text NOT NULL,                      -- e.g. C, LR, MR, HR, HC, MC
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id    uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  vehicle_class  text NOT NULL CHECK (vehicle_class IN ('BIKE', 'CAR', 'VAN', 'LIGHT_TRUCK', 'HEAVY_TRUCK', 'TIPPER')),
  registration   text,
  capacity_kg    integer CHECK (capacity_kg IS NULL OR capacity_kg >= 0)
);
CREATE INDEX vehicles_provider_idx ON vehicles(provider_id);

-- Which services a provider offers, with an optional negotiated fee that overrides the service default.
CREATE TABLE provider_services (
  provider_id      uuid NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  service_type_id  text NOT NULL REFERENCES service_types(id),
  fee_type         text CHECK (fee_type IN ('PERCENTAGE', 'FIXED')),
  fee_bps          integer CHECK (fee_bps BETWEEN 0 AND 10000),
  fee_fixed_cents  integer CHECK (fee_fixed_cents >= 0),
  PRIMARY KEY (provider_id, service_type_id)
);

CREATE TABLE jobs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id     text NOT NULL REFERENCES service_types(id),
  customer_id         uuid NOT NULL REFERENCES customers(id),
  provider_id         uuid REFERENCES providers(id),
  status              text NOT NULL DEFAULT 'OPEN'
                      CHECK (status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  description         text NOT NULL DEFAULT '',
  vehicle_class       text NOT NULL CHECK (vehicle_class IN ('BIKE', 'CAR', 'VAN', 'LIGHT_TRUCK', 'HEAVY_TRUCK', 'TIPPER')),
  pickup_address      text NOT NULL,
  pickup_lat          double precision NOT NULL,
  pickup_lng          double precision NOT NULL,
  dropoff_address     text NOT NULL,
  dropoff_lat         double precision NOT NULL,
  dropoff_lng         double precision NOT NULL,
  distance_km         double precision NOT NULL,
  quoted_price_cents  integer,                        -- platform price (PLATFORM services)
  agreed_price_cents  integer,                        -- what the customer will pay once a provider is assigned
  created_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
CREATE INDEX jobs_status_idx ON jobs(service_type_id, status);
CREATE INDEX jobs_customer_idx ON jobs(customer_id);
CREATE INDEX jobs_provider_idx ON jobs(provider_id);

CREATE TABLE bids (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  provider_id   uuid NOT NULL REFERENCES providers(id),
  amount_cents  integer NOT NULL CHECK (amount_cents > 0),
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, provider_id)
);

-- One charge per completed job: what the customer pays, what the company keeps, what the provider gets.
CREATE TABLE charges (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                 uuid NOT NULL UNIQUE REFERENCES jobs(id),
  service_type_id        text NOT NULL REFERENCES service_types(id),
  customer_id            uuid NOT NULL REFERENCES customers(id),
  provider_id            uuid NOT NULL REFERENCES providers(id),
  gross_cents            integer NOT NULL CHECK (gross_cents >= 0),
  platform_fee_cents     integer NOT NULL CHECK (platform_fee_cents >= 0),
  provider_payout_cents  integer NOT NULL CHECK (provider_payout_cents >= 0),
  fee_type               text NOT NULL,
  fee_bps                integer NOT NULL DEFAULT 0,
  fee_fixed_cents        integer NOT NULL DEFAULT 0,
  status                 text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  created_at             timestamptz NOT NULL DEFAULT now(),
  paid_at                timestamptz,
  CHECK (platform_fee_cents + provider_payout_cents = gross_cents)
);
