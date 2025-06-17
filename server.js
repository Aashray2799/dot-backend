const express = require('express');
const cors = require('cors');
require('dotenv').config();

const pool = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Get all available rooms - SIMPLE VERSION WITH MOTEL DATA
app.get('/api/rooms', async (req, res) => {
    try {
        const query = `SELECT * FROM room_inventory WHERE status = 'active'`;
        const result = await pool.query(query);
        
        // Add default motel information to each room
        const rooms = result.rows.map(room => ({
            ...room,
            motel_name: 'Signal Hill Motel',
            motel_address: 'Signal Hill, CA',
            total_rooms: 15,
            active_bookings: 0
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
        service: 'Room Dynamic Pricing API'
    });
});

app.listen(PORT, () => {
    console.log(`🏨 Motel Dynamic Pricing API running on port ${PORT}`);
});