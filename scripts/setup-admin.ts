import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const sql = neon(process.env.DATABASE_URL!);

async function setup() {
  await sql`CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL
  )`;
  
  const hash = await bcrypt.hash("sigma2026", 10);
  await sql`INSERT INTO admins (name, email, password_hash) VALUES ('Wayne Vaughan', 'wayne@sigmaschool.us', ${hash}) ON CONFLICT (email) DO NOTHING`;
  console.log("✅ Admin table + Wayne account created");
}
setup().catch(console.error);
