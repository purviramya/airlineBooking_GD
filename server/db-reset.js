// Drops all tables (including users and sessions) and re-generates the timetable. Usage: npm run db:reset
import './env.js';
import { pool, initDb } from './db.js';
import { migrateAuth } from './auth.js';

await pool.query('DROP TABLE IF EXISTS bookings, flights, session, account, verification, "user" CASCADE');
await migrateAuth();
await initDb();
await pool.end();
console.log('Database reset.');
