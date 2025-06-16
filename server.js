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

// Dynamic Pricing Algorithm
const calculateDynamicPrice = (basePrice, roomsAvailable, totalRooms, viewCount) => {
    let dynamicPrice = basePrice;
    
    // Availability factor (fewer rooms = higher price)
    const availabilityRatio = roomsAvailable / totalRooms;
    if (availabilityRatio <= 0.2) {
        dynamicPrice *= 1.3; // 30% increase
    } else if (availabilityRatio <= 0.4) {
        dynamicPrice *= 1.15; // 15% increase
    } else if (availabilityRatio >= 0.8) {
        dynamicPrice *= 0.85; // 15% decrease
    }
    
    // Demand factor (more views = higher price)
    if (viewCount > 20) {
        dynamicPrice *= 1.2;
    } else if (viewCount > 10) {
        dynamicPrice *= 1.1;
    }
    
    // Random market fluctuation (±5%)
    const marketFactor = 0.95 + (Math.random() * 0.1);
    dynamicPrice *= marketFactor;
    
    return Math.round(dynamicPrice * 100) / 100;
};

// Comment out this entire cron job
// cron.schedule('*/2 * * * *', async () => {
//     try {
//         console.log('🔄 Running dynamic pricing update...');
//         
//         const inventoryResult = await pool.query(`
//             SELECT ri.*, m.total_rooms, m.namw as motel_name
//             FROM room_inventory ri
//             JOIN motels m ON ri.motel_id = m.id
//             WHERE ri.status = 'active'
//         `);
//         
//         for (const room of inventoryResult.rows) {
//             const currentHour = new Date().getHours();
//             const isCurrentPeriod = 
//                 (room.pricing_period === 'morning' && currentHour >= 6 && currentHour < 18) ||
//                 (room.pricing_period === 'night' && (currentHour >= 18 || currentHour < 6));
//             
//             if (isCurrentPeriod) {
//                 const basePrice = room.pricing_period === 'morning' 
//                     ? parseFloat(room.base_price_morning)
//                     : parseFloat(room.base_price_night);
//                 
//                 const newPrice = calculateDynamicPrice(
//                     basePrice,
//                     room.rooms_available,
//                     room.total_rooms,
//                     room.view_count
//                 );
//                 
//                 if (Math.abs(newPrice - parseFloat(room.current_price)) > 1) {
//                     await pool.query(
//                         'UPDATE room_inventory SET current_price = $1, last_price_update = NOW() WHERE id = $2',
//                         [newPrice, room.id]
//                     );
//                     
//                     console.log(`💰 ${room.motel_name} ${room.room_type}: $${room.current_price} → $${newPrice}`);
//                 }
//             }
//         }
//     } catch (err) {
//         console.error('Error updating dynamic prices:', err);
//     }
// });

// Clean up expired bookings every minute
// Comment out this cron job too
// cron.schedule('* * * * *', async () => {
//     try {
//         const result = await pool.query(
//             'UPDATE room_bookings SET status = $1 WHERE expires_at::timestamp < NOW() AND status = $2',
//             ['expired', 'active']
//         );
//         if (result.rowCount > 0) {
//             console.log(`⏰ Expired ${result.rowCount} bookings`);
//         }
//     } catch (err) {
//         console.error('Error cleaning up expired bookings:', err);
//     }
// });

// Get all available rooms with current pricing
app.get('/api/rooms', async (req, res) => {
    try {
        const currentHour = new Date().getHours();
        const currentPeriod = (currentHour >= 6 && currentHour < 18) ? 'morning' : 'night';
        
        const query = `
            SELECT 
                ri.*,
                m.namw as motel_name,
                m.address as motel_address,
                m.total_rooms,
                COUNT(rb.id) as active_bookings
            FROM room_inventory ri
            JOIN motels m ON ri.motel_id = m.id
            LEFT JOIN room_bookings rb ON ri.id = rb.room_inventory_id AND rb.status = 'active'
            WHERE ri.status = 'active' AND ri.pricing_period = $1
            GROUP BY ri.id, m.name, m.address, m.total_rooms
            ORDER BY ri.current_price ASC
        `;
        
        const result = await pool.query(query, [currentPeriod]);
        
        // Increment view count for demand tracking
        const roomIds = result.rows.map(room => room.id);
        if (roomIds.length > 0) {
            await pool.query(
                'UPDATE room_inventory SET view_count = view_count + 1 WHERE id = ANY($1)',
                [roomIds]
            );
        }
        
        res.json(result.rows);
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
        
        // Check if room exists and is available
        const roomResult = await pool.query(
            'SELECT * FROM room_inventory WHERE id = $1 AND status = $2',
            [id, 'active']
        );
        
        if (roomResult.rows.length === 0) {
            return res.status(404).json({ error: 'Room not found or unavailable' });
        }
        
        const room = roomResult.rows[0];
        
        // Check if user already has an active booking for this room
        const existingBooking = await pool.query(
            'SELECT * FROM room_bookings WHERE room_inventory_id = $1 AND user_email = $2 AND status = $3',
            [id, user_email, 'active']
        );
        
        if (existingBooking.rows.length > 0) {
            return res.status(400).json({ error: 'You already have an active booking for this room' });
        }
        
        // Create new booking with 30-minute expiry
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes from now
        
        const bookingResult = await pool.query(
            'INSERT INTO room_bookings (room_inventory_id, user_email, check_in_date, expires_at, locked_price) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [id, user_email, check_in_date, expiresAt, room.current_price]
        );
        
        res.json({
            message: 'Room booked successfully',
            booking: bookingResult.rows[0],
            expires_in_minutes: 30
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
                m.name as motel_name,
                m.address as motel_address,
                EXTRACT(EPOCH FROM (rb.expires_at - NOW())) as seconds_remaining
            FROM room_bookings rb
            JOIN room_inventory ri ON rb.room_inventory_id = ri.id
            JOIN motels m ON ri.motel_id = m.id
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
        service: 'Room Dynamic Pricing API'
    });
});

app.listen(PORT, () => {
    console.log(`🏨 Motel Dynamic Pricing API running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`API Base URL: http://localhost:${PORT}/api`);
    console.log(`🔄 Dynamic pricing updates every 2 minutes`);
});