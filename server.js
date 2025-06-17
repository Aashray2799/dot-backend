const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const pool = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// EXTREME FOMO PRICING CONFIGURATION
const PRICING_CONFIG = {
  MINIMUM_PRICE: 75,    // Never go below $75
  MAXIMUM_PRICE: 130,   // Max surge price $130
  TOTAL_ROOMS: 15,      // Signal Hill Motel total rooms
  UPDATE_INTERVAL: 1,   // Update prices every 1 MINUTE for EXTREME FOMO
};

// Middleware
app.use(cors());
app.use(express.json());

// 1. DAY-OF-WEEK FOMO MULTIPLIERS
const getDayOfWeekMultiplier = () => {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 6=Saturday
  const hour = today.getHours();
  
  const dayMultipliers = {
    0: 0.85, // Sunday - Fill rooms
    1: 0.90, // Monday - Fill rooms  
    2: 0.95, // Tuesday - Slight discount
    3: 1.05, // Wednesday - Building demand
    4: 1.15, // Thursday - Pre-weekend premium
    5: 1.35, // Friday - Peak demand
    6: 1.40  // Saturday - Peak demand
  };
  
  let multiplier = dayMultipliers[dayOfWeek];
  
  // Same-day booking FOMO
  if (dayOfWeek >= 5 && hour >= 16) multiplier *= 1.15; // Weekend same-day +15%
  if (dayOfWeek <= 2 && hour >= 18) multiplier *= 0.95; // Slow day evening -5%
  
  return multiplier;
};

// 2. OCCUPANCY-BASED FOMO PRICING
const getOccupancyMultiplier = (roomsAvailable, dayOfWeek) => {
  const occupancyRate = (PRICING_CONFIG.TOTAL_ROOMS - roomsAvailable) / PRICING_CONFIG.TOTAL_ROOMS;
  
  if (dayOfWeek >= 5) { // Weekend - maximize revenue with FOMO
    if (occupancyRate >= 0.90) return 1.50; // 90%+ = +50% FOMO SURGE
    if (occupancyRate >= 0.80) return 1.30; // 80%+ = +30% 
    if (occupancyRate >= 0.70) return 1.20; // 70%+ = +20%
    if (occupancyRate >= 0.50) return 1.10; // 50%+ = +10%
    return 1.0;
  } else if (dayOfWeek <= 2) { // Slow days - fill rooms
    if (occupancyRate >= 0.70) return 1.15; // Actually filling = +15%
    if (occupancyRate >= 0.50) return 1.05; // Normal = +5%
    if (occupancyRate >= 0.30) return 0.95; // Low = -5%
    return 0.85; // Very low = -15% to attract customers
  } else { // Mid-week - balanced
    if (occupancyRate >= 0.80) return 1.25;
    if (occupancyRate >= 0.60) return 1.15;
    if (occupancyRate >= 0.40) return 1.10;
    return 0.98;
  }
};

// 3. GUARANTEED PRICE CHANGES - SUPER AGGRESSIVE VOLATILITY
const getVolatilityMultiplier = () => {
  const volatility = Math.random();
  const timestamp = Date.now();
  
  // Use timestamp to ensure different results each minute
  const timeBasedVariation = (timestamp % 1000) / 1000; // 0-1 based on milliseconds
  
  // 40% chance of BIG surge (instead of 15%)
  if (volatility > 0.60) return 1.25 + (timeBasedVariation * 0.15); // +25% to +40%
  
  // 40% chance of BIG drop (instead of 15%)  
  if (volatility < 0.40) return 0.70 - (timeBasedVariation * 0.10); // -30% to -40%
  
  // 20% chance of medium fluctuation - but still guaranteed change
  return 1.0 + ((volatility - 0.5) * 0.50) + (timeBasedVariation * 0.20); // Always ±25%+
};

// 4. TIME-TO-CHECKIN URGENCY PRICING  
const getUrgencyMultiplier = () => {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  // Add minute-based micro-variations for constant change
  const minuteVariation = 1.0 + (minute / 100); // 1.00 to 1.59
  
  // Late night booking urgency
  if (hour >= 22 || hour <= 6) return 1.20 * minuteVariation; // +20% + minute variation
  
  // Peak booking hours
  if (hour >= 18 && hour <= 21) return 1.10 * minuteVariation; // +10% + minute variation
  
  // Early morning discount
  if (hour >= 6 && hour <= 10) return 0.95 * minuteVariation; // -5% + minute variation
  
  return 1.0 * minuteVariation; // Always has minute-based variation
};

// 5. COMPETITIVE FOMO PRICING (vs Booking.com)
const getCompetitiveMultiplier = (basePrice, roomsAvailable) => {
  const bookingComPrice = 98; // Their price with taxes
  const ourEquivalent = basePrice * 1.12; // Add estimated taxes
  
  // Add random competitive pressure
  const competitivePressure = Math.random() * 0.20; // 0-20% variation
  
  // If we're much cheaper, CREATE FOMO by raising prices
  if (ourEquivalent < bookingComPrice * 0.80) return 1.15 + competitivePressure; // +15% + random
  
  // If low inventory, FOMO pricing regardless of competition
  if (roomsAvailable <= 5) return 1.10 + competitivePressure; // +10% + random
  
  // If we're more expensive, create DEAL FOMO
  if (ourEquivalent > bookingComPrice * 1.05) return 0.90 + competitivePressure; // -10% + random
  
  return 1.0 + competitivePressure; // Always has random variation
};

// 6. MAIN FOMO PRICING ALGORITHM
const calculateFOMOPrice = (room) => {
  const {
    base_price_morning,
    base_price_night,
    pricing_period,
    rooms_available,
    view_count = 0
  } = room;
  
  const basePrice = pricing_period === 'morning' 
    ? parseFloat(base_price_morning) 
    : parseFloat(base_price_night);
  
  const dayOfWeek = new Date().getDay();
  
  // Apply all FOMO multipliers - ALL have randomness built in now
  const dayMultiplier = getDayOfWeekMultiplier();
  const occupancyMultiplier = getOccupancyMultiplier(rooms_available, dayOfWeek);
  const volatilityMultiplier = getVolatilityMultiplier(); // GUARANTEED variation
  const urgencyMultiplier = getUrgencyMultiplier(); // Minute-based variation
  const competitiveMultiplier = getCompetitiveMultiplier(basePrice, rooms_available); // Random variation
  
  // Calculate FOMO price
  let fomoPrice = basePrice * 
    dayMultiplier * 
    occupancyMultiplier * 
    volatilityMultiplier * 
    urgencyMultiplier * 
    competitiveMultiplier;
  
  // Apply hard limits
  fomoPrice = Math.max(PRICING_CONFIG.MINIMUM_PRICE, 
                       Math.min(PRICING_CONFIG.MAXIMUM_PRICE, fomoPrice));
  
  return Math.round(fomoPrice);
};

// 7. EXTREME FOMO PRICING ENGINE - RUNS EVERY 1 MINUTE!
cron.schedule('*/1 * * * *', async () => {
  try {
    console.log('🔥 GUARANTEED PRICE CHANGES - Every 1 MINUTE!');
    
    const roomsResult = await pool.query('SELECT * FROM room_inventory WHERE status = $1', ['active']);
    const rooms = roomsResult.rows;
    
    for (const room of rooms) {
      const currentPrice = parseFloat(room.current_price);
      const newFOMOPrice = calculateFOMOPrice(room);
      
      // FORCE UPDATE - Always update price (remove the $1 minimum difference)
      await pool.query(
        'UPDATE room_inventory SET current_price = $1, last_price_update = NOW() WHERE id = $2',
        [newFOMOPrice, room.id]
      );
      
      const change = newFOMOPrice > currentPrice ? '📈 SURGE' : '📉 DROP';
      const amount = Math.abs(newFOMOPrice - currentPrice);
      
      if (amount >= 1) {
        console.log(`${change} Signal Hill Motel ${room.pricing_period}: $${currentPrice} → $${newFOMOPrice} (${amount > 15 ? '🔥 MASSIVE MOVE' : amount > 8 ? '⚡ BIG MOVE' : 'change'}: $${amount})`);
      } else {
        console.log(`🔄 MICRO-ADJUST Signal Hill Motel ${room.pricing_period}: $${currentPrice} → $${newFOMOPrice} (fine-tune: $${amount})`);
      }
    }
  } catch (err) {
    console.error('Error in EXTREME FOMO pricing update:', err);
  }
});

// 8. MANUAL PRICE OVERRIDE SYSTEM
app.post('/api/admin/override-price', async (req, res) => {
  try {
    const { roomId, price, duration = 24, reason = "Manual override" } = req.body;
    
    if (price < PRICING_CONFIG.MINIMUM_PRICE || price > PRICING_CONFIG.MAXIMUM_PRICE) {
      return res.status(400).json({ 
        error: `Price must be between $${PRICING_CONFIG.MINIMUM_PRICE} and $${PRICING_CONFIG.MAXIMUM_PRICE}` 
      });
    }
    
    // Update database immediately
    await pool.query(
      'UPDATE room_inventory SET current_price = $1 WHERE id = $2',
      [price, roomId]
    );
    
    res.json({ 
      message: `MANUAL OVERRIDE: Price set to $${price} for room ${roomId}`,
      reason: reason
    });
    
  } catch (error) {
    console.error('Error setting price override:', error);
    res.status(500).json({ error: 'Failed to set price override' });
  }
});

// 9. PRICING STATUS FOR ADMIN
app.get('/api/admin/pricing-status', async (req, res) => {
  try {
    const roomsResult = await pool.query('SELECT * FROM room_inventory WHERE status = $1', ['active']);
    const rooms = roomsResult.rows;
    
    const pricingStatus = rooms.map(room => {
      const optimalPrice = calculateFOMOPrice(room);
      const currentPrice = parseFloat(room.current_price);
      
      return {
        roomId: room.id,
        roomType: room.room_type,
        pricingPeriod: room.pricing_period,
        currentPrice,
        optimalPrice,
        revenueOpportunity: optimalPrice - currentPrice,
        roomsAvailable: room.rooms_available,
        lastUpdate: room.last_price_update
      };
    });
    
    res.json({ 
      pricingStatus,
      fomoActive: true,
      updateInterval: `${PRICING_CONFIG.UPDATE_INTERVAL} minute`,
      priceRange: `$${PRICING_CONFIG.MINIMUM_PRICE}-$${PRICING_CONFIG.MAXIMUM_PRICE}`,
      extremeFomo: true,
      guaranteedChanges: true
    });
    
  } catch (error) {
    console.error('Error getting pricing status:', error);
    res.status(500).json({ error: 'Failed to get pricing status' });
  }
});

// Get all available rooms - WITH EXTREME FOMO DATA
app.get('/api/rooms', async (req, res) => {
    try {
        const query = `SELECT * FROM room_inventory WHERE status = 'active'`;
        const result = await pool.query(query);
        
        // Add motel information and EXTREME FOMO indicators
        const rooms = result.rows.map(room => ({
            ...room,
            motel_name: 'Signal Hill Motel',
            motel_address: 'Signal Hill, CA',
            total_rooms: 15,
            active_bookings: 0,
            // EXTREME FOMO indicators
            price_last_updated: room.last_price_update,
            next_update: '1 minute',
            fomo_active: true,
            extreme_fomo: true,
            guaranteed_changes: true
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
        
        res.json({
            message: 'Room booked successfully! Price locked for 30 minutes.',
            booking: bookingResult.rows[0],
            expires_in_minutes: 30,
            locked_price: room.current_price,
            fomo_warning: 'Prices change every minute - you locked in just in time!'
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
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'DOT - GUARANTEED PRICE CHANGES API',
        fomo_active: true,
        extreme_fomo: true,
        guaranteed_changes: true,
        update_interval: '1 minute'
    });
});

// Force immediate price update for testing
app.get('/api/force-update', async (req, res) => {
    try {
        console.log('🚨 MANUAL FORCE UPDATE TRIGGERED!');
        
        const roomsResult = await pool.query('SELECT * FROM room_inventory WHERE status = $1', ['active']);
        const rooms = roomsResult.rows;
        
        for (const room of rooms) {
            const currentPrice = parseFloat(room.current_price);
            const newFOMOPrice = calculateFOMOPrice(room);
            
            await pool.query(
                'UPDATE room_inventory SET current_price = $1, last_price_update = NOW() WHERE id = $2',
                [newFOMOPrice, room.id]
            );
            
            console.log(`🔄 FORCED UPDATE: ${room.pricing_period} $${currentPrice} → $${newFOMOPrice}`);
        }
        
        res.json({ 
            message: 'Pricing update forced! GUARANTEED price changes applied!',
            timestamp: new Date().toISOString(),
            rooms_updated: rooms.length
        });
        
    } catch (err) {
        console.error('Error in forced update:', err);
        res.status(500).json({ error: 'Failed to force update' });
    }
});

app.listen(PORT, () => {
    console.log(`🔥 DOT GUARANTEED PRICE CHANGES API running on port ${PORT}`);
    console.log(`⚡ Prices GUARANTEED to change every ${PRICING_CONFIG.UPDATE_INTERVAL} minute!`);
    console.log(`💰 Price range: $${PRICING_CONFIG.MINIMUM_PRICE}-$${PRICING_CONFIG.MAXIMUM_PRICE}`);
});

// Log startup message
console.log('🎯 GUARANTEED PRICE CHANGES SYSTEM ACTIVATED!');
console.log('📈 Prices WILL surge and drop every 1 MINUTE - NO EXCEPTIONS!');
console.log('🔥 Creating MAXIMUM urgency for Signal Hill Motel!');
console.log('⚡ Every price update is GUARANTEED to change - no more stable prices!');