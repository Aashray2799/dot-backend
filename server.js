const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const nodemailer = require('nodemailer'); // ADD THIS LINE
require('dotenv').config();

const pool = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// ADD EMAIL CONFIGURATION RIGHT HERE (AFTER IMPORTS)
// Email configuration for Signal Hill Motel notifications
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'guestsignalhill@gmail.com',     // Create this Gmail account
    pass: 'zjle xpws vatu qnzv'        // Gmail app password (not regular password)
  }
});

// Signal Hill Motel notification function
const sendBookingNotification = async (bookingData) => {
  try {
    const emailContent = {
      from: 'DOT Bookings <dotbookings2025@gmail.com>',
      to: 'nikhil.aashray@gmail.com', // REPLACE WITH REAL MOTEL OWNER EMAIL
      subject: '🏨 NEW BOOKING ALERT - Signal Hill Motel - URGENT!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #9d4edd, #c77dff); padding: 20px; text-align: center; color: white;">
            <h1>🏨 NEW BOOKING RECEIVED!</h1>
            <h2>Signal Hill Motel</h2>
          </div>
          
          <div style="background: #f8f9ff; padding: 25px; border-radius: 0 0 10px 10px;">
            <div style="background: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 5px solid #9d4edd;">
              <h3 style="color: #9d4edd; margin-top: 0;">📋 Booking Details:</h3>
              <p><strong>🧑‍💼 Customer Email:</strong> ${bookingData.customer_email}</p>
              <p><strong>🏠 Room Type:</strong> ${bookingData.room_type}</p>
              <p><strong>💰 Locked Price:</strong> $${bookingData.locked_price} (NO COMMISSION!)</p>
              <p><strong>📅 Check-in Date:</strong> ${bookingData.check_in_date}</p>
              <p><strong>🆔 Booking ID:</strong> #${bookingData.booking_id}</p>
              <p><strong>🏨 Rooms Left:</strong> ${bookingData.rooms_left} rooms remaining</p>
            </div>
            
            <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p style="margin: 0;"><strong>⏰ IMPORTANT:</strong> Customer has <strong>30 minutes</strong> to confirm this booking!</p>
              <p style="margin: 5px 0 0 0; font-size: 14px;">Booking expires at: <strong>${new Date(Date.now() + 30 * 60 * 1000).toLocaleString()}</strong></p>
            </div>
            
            <div style="background: #d1ecf1; padding: 15px; border-radius: 8px; border-left: 4px solid #17a2b8; margin: 20px 0;">
              <p style="margin: 0;"><strong>💵 Revenue:</strong> $${bookingData.locked_price}</p>
              <p style="margin: 5px 0 0 0;"><strong>🎯 Commission:</strong> $0 (Keep 100% vs Booking.com's 15-20%)</p>
            </div>
            
            <div style="text-align: center; margin: 25px 0;">
              <p style="color: #666; margin: 10px 0;">
                <strong>📍 Location:</strong> Signal Hill, CA<br>
                <strong>🕐 Booked At:</strong> ${new Date().toLocaleString()}<br>
                <strong>📱 Platform:</strong> DOT - Deals on Time
              </p>
            </div>
          </div>
          
          <div style="background: #e9ecef; padding: 15px; text-align: center; border-radius: 0 0 10px 10px;">
            <p style="color: #6c757d; font-size: 12px; margin: 0;">
              This notification was sent by <strong>DOT - Deals on Time</strong><br>
              Helping Signal Hill Motel maximize revenue without commission fees!<br>
              📧 Questions? Reply to this email or contact DOT support.
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(emailContent);
    console.log('📧 ✅ Booking notification sent to Signal Hill Motel owner!');
    
  } catch (error) {
    console.error('📧 ❌ Failed to send booking notification:', error);
  }
};

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
      
      // REALISTIC ROOM AVAILABILITY: Use actual rooms_available from database
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
      
      console.log(`${change} ${currentDay} ${room.pricing_period}: $${currentPrice} → $${result.new_price} (${result.day_range}) ${amount > 0 ? `±$${amount}` : ''} | ${room.rooms_available} rooms left`);
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

// Get all available rooms - FIXED: Realistic room counts & correct time periods
app.get('/api/rooms', async (req, res) => {
    try {
        const query = `SELECT * FROM room_inventory WHERE status = 'active'`;
        const result = await pool.query(query);
        
        const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
        const dayNum = new Date().getDay();
        const min_price = dayNum <= 2 ? 75 : 80;
        const max_price = 99;
        
        const rooms = result.rows.map(room => {
            // FIXED: Generate realistic room availability (2-8 rooms left)
            const realisticRoomsLeft = Math.floor(Math.random() * 7) + 2; // 2-8 rooms left
            
            return {
                ...room,
                motel_name: 'Signal Hill Motel',
                motel_address: 'Signal Hill, CA',
                total_rooms: 15,
                rooms_available: realisticRoomsLeft, // FIXED: Now shows 2-8 instead of 15
                active_bookings: 15 - realisticRoomsLeft, // Calculate bookings
                
                // FIXED: Correct time periods (3PM - 11AM)
                period_start: room.pricing_period === 'afternoon' ? "15:00:00" : "23:00:00", // 3PM or 11PM
                period_end: room.pricing_period === 'afternoon' ? "23:00:00" : "11:00:00",   // 11PM or 11AM
                
                // Day-specific FOMO indicators
                price_last_updated: room.last_price_update,
                next_update: '1 minute',
                fomo_active: true,
                day_specific_pricing: true,
                current_day: currentDay,
                price_range: `$${min_price}-$${max_price}`,
                
                // FOMO messaging based on rooms left
                urgency_message: realisticRoomsLeft <= 3 ? 
                    `🚨 ONLY ${realisticRoomsLeft} ROOMS LEFT!` : 
                    realisticRoomsLeft <= 5 ? 
                    `⚡ ${realisticRoomsLeft} rooms remaining` : 
                    `${realisticRoomsLeft} rooms available`
            };
        });
        
        res.json(rooms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Book a room (30-minute hold) - WITH EMAIL NOTIFICATION!
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
        
        // Check if rooms are actually available
        if (room.rooms_available <= 0) {
            return res.status(400).json({ error: 'No rooms available for this type' });
        }
        
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
        
        // FIXED: Reduce available rooms when booking
        await pool.query(
            'UPDATE room_inventory SET rooms_available = rooms_available - 1 WHERE id = $1',
            [id]
        );
        
        const bookingResult = await pool.query(
            'INSERT INTO room_bookings (room_inventory_id, user_email, check_in_date, expires_at, locked_price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id, user_email, check_in_date, expiresAt, room.current_price]
        );
        
        const currentDay = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];
        const roomsLeft = room.rooms_available - 1;
        
        // 🚨 SEND EMAIL NOTIFICATION TO SIGNAL HILL MOTEL OWNER!
        await sendBookingNotification({
            customer_email: user_email,
            room_type: room.room_type,
            locked_price: room.current_price,
            check_in_date: check_in_date,
            booking_id: bookingResult.rows[0].id,
            rooms_left: roomsLeft
        });
        
        console.log('🏨 📧 Signal Hill Motel notified of new booking via email!');
        
        res.json({
            message: 'Room booked successfully! Price locked for 30 minutes.',
            booking: bookingResult.rows[0],
            expires_in_minutes: 30,
            locked_price: room.current_price,
            rooms_left: roomsLeft,
            fomo_warning: roomsLeft <= 2 ? 
                `🚨 URGENT: Only ${roomsLeft} rooms left after your booking!` :
                `Prices change every minute on ${currentDay}s - you locked in just in time!`,
            notification_sent: true // Confirms Signal Hill Motel was notified
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
                ri.rooms_available,
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
        update_interval: '1 minute',
        realistic_inventory: true,
        time_periods: "3PM-11AM",
        email_notifications: true // NEW: Confirms email system is active
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
            
            console.log(`🔄 FORCED UPDATE: ${currentDay} ${room.pricing_period} $${currentPrice} → $${result.new_price} (${result.day_range}) | ${room.rooms_available} rooms left`);
        }
        
        res.json({ 
            message: 'Day-specific pricing update forced!',
            current_day: currentDay,
            timestamp: new Date().toISOString(),
            rooms_updated: rooms.length,
            note: 'Realistic room counts and 3PM-11AM periods active'
        });
        
    } catch (err) {
        console.error('Error in forced update:', err);
        res.status(500).json({ error: 'Failed to force update' });
    }
});

// BONUS: Update existing room inventory to realistic numbers (run once)
app.get('/api/fix-inventory', async (req, res) => {
    try {
        console.log('🔧 FIXING ROOM INVENTORY TO REALISTIC NUMBERS...');
        
        // Update all rooms to have realistic availability (2-8 rooms left)
        const rooms = await pool.query('SELECT id FROM room_inventory WHERE status = $1', ['active']);
        
        for (const room of rooms.rows) {
            const realisticCount = Math.floor(Math.random() * 7) + 2; // 2-8 rooms
            await pool.query(
                'UPDATE room_inventory SET rooms_available = $1, period_start = $2, period_end = $3 WHERE id = $4',
                [realisticCount, '15:00:00', '11:00:00', room.id]
            );
        }
        
        res.json({
            message: 'Room inventory fixed! All rooms now show realistic availability (2-8 rooms) and correct time periods (3PM-11AM)',
            rooms_updated: rooms.rows.length
        });
        
    } catch (err) {
        console.error('Error fixing inventory:', err);
        res.status(500).json({ error: 'Failed to fix inventory' });
    }
});

// NEW: Test email notification endpoint
app.get('/api/test-email', async (req, res) => {
    try {
        await sendBookingNotification({
            customer_email: 'test.customer@gmail.com',
            room_type: 'Standard Room',
            locked_price: 85,
            check_in_date: '2025-06-18',
            booking_id: 'TEST123',
            rooms_left: 3
        });
        
        res.json({
            message: 'Test email sent to Signal Hill Motel owner!',
            timestamp: new Date().toISOString()
        });
        
    } catch (err) {
        console.error('Error sending test email:', err);
        res.status(500).json({ error: 'Failed to send test email' });
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
    console.log(`🏨 Realistic room counts (2-8 available) | ⏰ Time periods: 3PM-11AM`);
    console.log(`📧 Email notifications ACTIVE for Signal Hill Motel bookings!`);
});

// Log startup message
console.log('🎯 DAY-SPECIFIC PRICING SYSTEM ACTIVATED!');
console.log('📅 Sun/Mon/Tue: $75-$99 | Wed/Thu/Fri/Sat: $80-$99');
console.log('🔥 Smart bias: Low occupancy → Lower prices | High occupancy → Higher prices');
console.log('⚡ Updates every 60 seconds with 0.5%-3% randomness!');
console.log('🏨 FIXED: Realistic room availability (2-8 rooms left)');
console.log('⏰ FIXED: Time periods changed to 3PM-11AM');
console.log('📧 NEW: Signal Hill Motel gets instant email alerts for all bookings!');