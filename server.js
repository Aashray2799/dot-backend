const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const pool = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// SIGNAL HILL MOTEL DAY-SPECIFIC PRICING ENGINE
const calculateDynamicPrice = (
  base_price = 86,
  day_of_week,          // 'Sunday', 'Monday', etc.
  current_occupancy,    // 0-100 percentage
  time_of_day,          // 0-23 hours
  previous_price,       // Last price
  user_traffic          // Number of users viewing
) => {
  
  // Convert day to number for easier logic
  const dayMap = {
    'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3,
    'Thursday': 4, 'Friday': 5, 'Saturday': 6
  };
  const dayNum = dayMap[day_of_week];
  
  // Day-specific price ranges
  let min_price, max_price;
  if (dayNum <= 2) { // Sunday, Monday, Tuesday
    min_price = 75;
    max_price = 99;
  } else { // Wednesday, Thursday, Friday, Saturday
    min_price = 80;
    max_price = 99;
  }
  
  // 1. OCCUPANCY BIAS (Primary driver)
  let occupancy_multiplier;
  const occupancy_decimal = current_occupancy / 100;
  
  if (dayNum <= 2) { // Low-demand days (Sun-Tue)
    // Start higher, gradually drop to $75 if low occupancy
    if (occupancy_decimal >= 0.80) {
      occupancy_multiplier = 1.10; // High occupancy = push toward max
    } else if (occupancy_decimal >= 0.60) {
      occupancy_multiplier = 1.00; // Medium occupancy = neutral
    } else if (occupancy_decimal >= 0.40) {
      occupancy_multiplier = 0.90; // Low occupancy = bias downward
    } else {
      occupancy_multiplier = 0.80; // Very low = strong downward bias
    }
  } else { // Higher-demand days (Wed-Sat)
    if (occupancy_decimal >= 0.85) {
      occupancy_multiplier = 1.15; // High occupancy = push toward $99
    } else if (occupancy_decimal >= 0.70) {
      occupancy_multiplier = 1.08; // Good occupancy = upward bias
    } else if (occupancy_decimal >= 0.50) {
      occupancy_multiplier = 1.00; // Medium occupancy = neutral
    } else if (occupancy_decimal >= 0.30) {
      occupancy_multiplier = 0.95; // Low occupancy = slight downward
    } else {
      occupancy_multiplier = 0.88; // Very low = bias toward min price
    }
  }
  
  // 2. TIME-OF-DAY BIAS
  let time_multiplier;
  if (time_of_day >= 14 && time_of_day <= 18) { // 2-6 PM peak booking
    time_multiplier = 1.05;
  } else if (time_of_day >= 19 && time_of_day <= 22) { // Evening same-day bookings
    time_multiplier = 1.08;
  } else if (time_of_day >= 23 || time_of_day <= 2) { // Late night urgency
    time_multiplier = 1.10;
  } else if (time_of_day >= 6 && time_of_day <= 10) { // Morning planning
    time_multiplier = 0.98;
  } else {
    time_multiplier = 1.00; // Neutral hours
  }
  
  // 3. TRAFFIC BIAS (Demand signal)
  let traffic_multiplier;
  if (user_traffic >= 25) {
    traffic_multiplier = 1.06; // High traffic = upward pressure
  } else if (user_traffic >= 15) {
    traffic_multiplier = 1.03; // Moderate traffic = slight upward
  } else if (user_traffic >= 8) {
    traffic_multiplier = 1.00; // Normal traffic = neutral
  } else if (user_traffic >= 3) {
    traffic_multiplier = 0.98; // Low traffic = slight downward
  } else {
    traffic_multiplier = 0.95; // Very low traffic = downward bias
  }
  
  // 4. MARKET FLUCTUATION (0.5% to 3% randomness)
  const random_factor = 1 + (Math.random() - 0.5) * 0.06; // ±3% max
  const small_fluctuation = Math.max(0.995, Math.min(1.03, random_factor)); // Ensure 0.5%-3% range
  
  // 5. MOMENTUM BIAS (Prevent ping-ponging)
  let momentum_multiplier = 1.0;
  const price_vs_base = previous_price / base_price;
  
  if (price_vs_base > 1.10) { // Price well above base
    momentum_multiplier = 0.98; // Slight downward pressure
  } else if (price_vs_base < 0.90) { // Price well below base
    momentum_multiplier = 1.02; // Slight upward pressure
  }
  
  // 6. CALCULATE NEW PRICE
  let new_price = base_price * 
    occupancy_multiplier * 
    time_multiplier * 
    traffic_multiplier * 
    small_fluctuation * 
    momentum_multiplier;
  
  // 7. STRICT DAY-SPECIFIC PRICE CAPS
  new_price = Math.max(min_price, Math.min(max_price, new_price));
  
  // 8. ROUND TO NEAREST DOLLAR
  new_price = Math.round(new_price);
  
  return {
    new_price: new_price,
    price_change: new_price - previous_price,
    day_range: `$${min_price}-$${max_price}`,
    min_price: min_price,
    max_price: max_price
  };
};

// PRICING ENGINE WITH 60-SECOND UPDATES
cron.schedule('*/1 * * * *', async () => {
  try {
    console.log('🔥 DAY-SPECIFIC PRICING UPDATE - Every 1 MINUTE!');
    
    const roomsResult = await pool.query('SELECT * FROM room_inventory WHERE status = $1', ['active']);
    const rooms = roomsResult.rows;
    
    // Get current day and time
    const now = new Date();
    const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][now.getDay()];
    const currentHour = now.getHours();
    
    for (const room of rooms) {
      const currentPrice = parseFloat(room.current_price);
      const occupancyPercent = ((15 - room.rooms_available) / 15) * 100; // Convert to percentage
      const userTraffic = room.view_count || Math.floor(Math.random() * 15) + 5; // Simulate traffic
      
      const result = calculateDynamicPrice(
        86,           // base_price
        currentDay,   // day_of_week
        occupancyPercent, // current_occupancy %
        currentHour,  // time_of_day
        currentPrice, // previous_price
        userTraffic   // user_traffic
      );
      
      // Always update price (guaranteed changes)
      await pool.query(
        'UPDATE room_inventory SET current_price = $1, last_price_update = NOW() WHERE id = $2',
        [result.new_price, room.id]
      );
      
      const change = result.new_price > currentPrice ? '📈 SURGE' : result.new_price < currentPrice ? '📉 DROP' : '🔄 ADJUST';
      const amount = Math.abs(result.new_price - currentPrice);
      
      console.log(`${change} ${currentDay} ${room.pricing_period}: $${currentPrice} → $${result.new_price} (${result.day_range}) ${amount > 0 ? `±$${amount}` : ''}`);
    }
  } catch (err) {
    console.error('Error in day-specific pricing update:', err);
  }
});

// MANUAL PRICE OVERRIDE SYSTEM
app.post('/api/admin/override-price', async (req, res) => {
  try {
    const { roomId, price, duration = 24, reason = "Manual override" } = req.body;
    
    // Get current day to check valid range
    const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    const dayNum = new Date().getDay();
    const min_price = dayNum <= 2 ? 75 : 80; // Sun-Tue: $75, Wed-Sat: $80
    const max_price = 99;
    
    if (price < min_price || price > max_price) {
      return res.status(400).json({ 
        error: `Price must be between $${min_price} and $${max_price} for ${currentDay}` 
      });
    }
    
    // Update database immediately
    await pool.query(
      'UPDATE room_inventory SET current_price = $1 WHERE id = $2',
      [price, roomId]
    );
    
    res.json({ 
      message: `MANUAL OVERRIDE: Price set to $${price} for room ${roomId} (${currentDay} range: $${min_price}-$${max_price})`,
      reason: reason
    });
    
  } catch (error) {
    console.error('Error setting price override:', error);
    res.status(500).json({ error: 'Failed to set price override' });
  }
});

// PRICING STATUS FOR ADMIN
app.get('/api/admin/pricing-status', async (req, res) => {
  try {
    const roomsResult = await pool.query('SELECT * FROM room_inventory WHERE status = $1', ['active']);
    const rooms = roomsResult.rows;
    
    const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    const dayNum = new Date().getDay();
    const min_price = dayNum <= 2 ? 75 : 80;
    const max_price = 99;
    
    const pricingStatus = rooms.map(room => {
      const occupancyPercent = ((15 - room.rooms_available) / 15) * 100;
      const userTraffic = room.view_count || 5;
      
      const optimalResult = calculateDynamicPrice(
        86, currentDay, occupancyPercent, new Date().getHours(),
        parseFloat(room.current_price), userTraffic
      );
      
      return {
        roomId: room.id,
        roomType: room.room_type,
        pricingPeriod: room.pricing_period,
        currentPrice: parseFloat(room.current_price),
        optimalPrice: optimalResult.new_price,
        revenueOpportunity: optimalResult.new_price - parseFloat(room.current_price),
        roomsAvailable: room.rooms_available,
        lastUpdate: room.last_price_update,
        dayRange: `$${min_price}-$${max_price}`,
        currentDay: currentDay
      };
    });
    
    res.json({ 
      pricingStatus,
      fomoActive: true,
      updateInterval: '1 minute',
      currentDay: currentDay,
      priceRange: `$${min_price}-$${max_price}`,
      daySpecificPricing: true
    });
    
  } catch (error) {
    console.error('Error getting pricing status:', error);
    res.status(500).json({ error: 'Failed to get pricing status' });
  }
});

// Get all available rooms
app.get('/api/rooms', async (req, res) => {
    try {
        const query = `SELECT * FROM room_inventory WHERE status = 'active'`;
        const result = await pool.query(query);
        
        const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
        const dayNum = new Date().getDay();
        const min_price = dayNum <= 2 ? 75 : 80;
        const max_price = 99;
        
        const rooms = result.rows.map(room => ({
            ...room,
            motel_name: 'Signal Hill Motel',
            motel_address: 'Signal Hill, CA',
            total_rooms: 15,
            active_bookings: 0,
            // Day-specific FOMO indicators
            price_last_updated: room.last_price_update,
            next_update: '1 minute',
            fomo_active: true,
            day_specific_pricing: true,
            current_day: currentDay,
            price_range: `$${min_price}-$${max_price}`
        }));
        
        res.json(rooms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Book a room (30-minute hold)
app.post('/api/rooms/:id/book', async (req, res) => {
    try {
        const { id } = req.params;
        const { user_email, check_in_date = new Date().toISOString().split('T')[0] } = req.body;
        
        if (!user_email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        
        const roomResult = await pool.query(
            'SELECT * FROM room_inventory WHERE id = $1 AND status = $2',
            [id, 'active']
        );
        
        if (roomResult.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or unavailable' });
        }
        
        const room = roomResult.rows[0];
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        
        const bookingResult = await pool.query(
            'INSERT INTO room_bookings (room_inventory_id, user_email, check_in_date, expires_at, locked_price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id, user_email, check_in_date, expiresAt, room.current_price]
        );
        
        const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
        
        res.json({
            message: 'Room booked successfully! Price locked for 30 minutes.',
            booking: bookingResult.rows[0],
            expires_in_minutes: 30,
            locked_price: room.current_price,
            fomo_warning: `Prices change every minute on ${currentDay}s - you locked in just in time!`
        });
        
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's active bookings
app.get('/api/bookings/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const query = `
            SELECT 
                rb.*,
                ri.room_type,
                ri.pricing_period,
                'Signal Hill Motel' as motel_name,
                'Signal Hill, CA' as motel_address,
                EXTRACT(EPOCH FROM (rb.expires_at - NOW())) as seconds_remaining
            FROM room_bookings rb
            JOIN room_inventory ri ON rb.room_inventory_id = ri.id
            WHERE rb.user_email = $1 AND rb.status = 'active'
            ORDER BY rb.expires_at ASC
        `;
        
        const result = await pool.query(query, [email]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Health check
app.get('/health', (req, res) => {
    const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    const dayNum = new Date().getDay();
    const min_price = dayNum <= 2 ? 75 : 80;
    const max_price = 99;
    
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'DOT - Day-Specific Pricing API',
        fomo_active: true,
        day_specific_pricing: true,
        current_day: currentDay,
        price_range: `$${min_price}-$${max_price}`,
        update_interval: '1 minute'
    });
});

// Force immediate price update for testing
app.get('/api/force-update', async (req, res) => {
    try {
        console.log('🚨 MANUAL FORCE UPDATE TRIGGERED!');
        
        const roomsResult = await pool.query('SELECT * FROM room_inventory WHERE status = $1', ['active']);
        const rooms = roomsResult.rows;
        
        const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
        const currentHour = new Date().getHours();
        
        for (const room of rooms) {
            const currentPrice = parseFloat(room.current_price);
            const occupancyPercent = ((15 - room.rooms_available) / 15) * 100;
            const userTraffic = Math.floor(Math.random() * 20) + 5;
            
            const result = calculateDynamicPrice(
                86, currentDay, occupancyPercent, currentHour,
                currentPrice, userTraffic
            );
            
            await pool.query(
                'UPDATE room_inventory SET current_price = $1, last_price_update = NOW() WHERE id = $2',
                [result.new_price, room.id]
            );
            
            console.log(`🔄 FORCED UPDATE: ${currentDay} ${room.pricing_period} $${currentPrice} → $${result.new_price} (${result.day_range})`);
        }
        
        res.json({ 
            message: 'Day-specific pricing update forced!',
            current_day: currentDay,
            timestamp: new Date().toISOString(),
            rooms_updated: rooms.length
        });
        
    } catch (err) {
        console.error('Error in forced update:', err);
        res.status(500).json({ error: 'Failed to force update' });
    }
});

app.listen(PORT, () => {
    const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
    const dayNum = new Date().getDay();
    const min_price = dayNum <= 2 ? 75 : 80;
    const max_price = 99;
    
    console.log(`🔥 DOT DAY-SPECIFIC PRICING API running on port ${PORT}`);
    console.log(`📅 Today: ${currentDay} | Range: $${min_price}-$${max_price}`);
    console.log(`⚡ Prices update every 1 minute with smart bias!`);
});

// Log startup message
console.log('🎯 DAY-SPECIFIC PRICING SYSTEM ACTIVATED!');
console.log('📅 Sun/Mon/Tue: $75-$99 | Wed/Thu/Fri/Sat: $80-$99');
console.log('🔥 Smart bias: Low occupancy → Lower prices | High occupancy → Higher prices');
console.log('⚡ Updates every 60 seconds with 0.5%-3% randomness!');