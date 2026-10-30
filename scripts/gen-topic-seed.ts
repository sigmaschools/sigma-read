// Regenerate drizzle/0011_interest_graph.sql from src/lib/interest-graph/taxonomy.ts
// Run with: npx tsx scripts/gen-topic-seed.ts

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { topicSeedSql } from "../src/lib/interest-graph/seed-sql";

const path = join(__dirname, "..", "drizzle", "0011_interest_graph.sql");
writeFileSync(path, topicSeedSql());
console.log(`Wrote ${path}`);
