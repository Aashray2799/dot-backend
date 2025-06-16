const { Pool } = require('pg');

console.log('DATABASE_URL:', process.env.DATABASE_URL);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/dot_mvp',
    ssl: process.env.DATABASE_URL ? {
        rejectUnauthorized: false
    } : false
});

module.exports = pool;