import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function setup() {
  await sql`CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )`;
  
  // No password: an admin opens the admin pages from Compass Admin and is linked by email on the first visit
  await sql`INSERT INTO admins (name, email) VALUES ('Wayne Vaughan', 'wayne@sigmaschool.us') ON CONFLICT (email) DO NOTHING`;
  console.log("✅ Admin table + Wayne account created");
}
setup().catch(console.error);
