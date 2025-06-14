-- Clear existing data
DROP TABLE IF EXISTS room_bookings CASCADE;
DROP TABLE IF EXISTS room_inventory CASCADE;
DROP TABLE IF EXISTS motels CASCADE;

-- Motels table (replacing restaurants)
CREATE TABLE IF NOT EXISTS motels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    total_rooms INTEGER NOT NULL DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room inventory table (replacing deals)
CREATE TABLE IF NOT EXISTS room_inventory (
    id SERIAL PRIMARY KEY,
    motel_id INTEGER REFERENCES motels(id),
    room_type VARCHAR(100) NOT NULL DEFAULT 'Standard',
    base_price_morning DECIMAL(10,2) NOT NULL DEFAULT 100.00,
    base_price_night DECIMAL(10,2) NOT NULL DEFAULT 75.00,
    current_price DECIMAL(10,2) NOT NULL,
    rooms_available INTEGER NOT NULL,
    pricing_period VARCHAR(20) NOT NULL,
    period_start TIME NOT NULL,
    period_end TIME NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    last_price_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Room bookings table (replacing claims)
CREATE TABLE IF NOT EXISTS room_bookings (
    id SERIAL PRIMARY KEY,
    room_inventory_id INTEGER REFERENCES room_inventory(id),
    user_email VARCHAR(255) NOT NULL,
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    check_in_date DATE NOT NULL,
    locked_price DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'active',
    rooms_booked INTEGER DEFAULT 1
);

-- Insert Signal Hill Motel (your real motel)
INSERT INTO motels (name, address, total_rooms) VALUES 
('Signal Hill Motel', 'Signal Hill, CA', 15);

-- Insert Signal Hill room inventory with real dynamic pricing
INSERT INTO room_inventory (motel_id, room_type, base_price_morning, base_price_night, current_price, rooms_available, pricing_period, period_start, period_end) VALUES
-- Morning rates (6 AM - 6 PM) - Higher demand period
(1, 'Standard Room', 85.00, 75.00, 83.00, 15, 'morning', '06:00:00', '18:00:00'),

-- Night rates (6 PM - 6 AM) - Fill empty rooms  
(1, 'Standard Room', 85.00, 75.00, 72.00, 15, 'night', '18:00:00', '06:00:00');