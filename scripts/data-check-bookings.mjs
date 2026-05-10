import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = join(__dirname, "../../futuros-demo/.env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    })
);

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

console.log("Bookings data integrity check\n=================================\n");

// Check 1: malformed date strings
const { count: malformedCount, error: e1 } = await supabase
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .not("date", "match", "^[0-9]{4}-[0-9]{2}-[0-9]{2}$");
if (e1) console.error("1. ERROR:", e1.message);
else console.log(`1. Bookings with malformed date (NOT YYYY-MM-DD): ${malformedCount}`);

// Check 2: alquiler with NULL client_id
const { count: nullClientCount, error: e2 } = await supabase
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .is("client_id", null)
  .eq("activity_type", "alquiler");
if (e2) console.error("2. ERROR:", e2.message);
else console.log(`2. Alquiler bookings with NULL client_id: ${nullClientCount}`);

// Check 3: type values outside (F5, F7, F11)
const { count: weirdTypeCount, error: e3 } = await supabase
  .from("bookings")
  .select("id", { count: "exact", head: true })
  .not("type", "in", "(F5,F7,F11)");
if (e3) console.error("3. ERROR:", e3.message);
else console.log(`3. Bookings with type NOT IN (F5,F7,F11): ${weirdTypeCount}`);

// Bonus: total bookings + sample weird rows
const { count: totalCount } = await supabase
  .from("bookings")
  .select("id", { count: "exact", head: true });
console.log(`\nTotal bookings: ${totalCount}`);

if (weirdTypeCount > 0) {
  const { data: weirdSample } = await supabase
    .from("bookings")
    .select("id, type, activity_type, date")
    .not("type", "in", "(F5,F7,F11)")
    .limit(5);
  console.log("Sample of unusual type values:", weirdSample);
}

if (nullClientCount > 0) {
  const { data: nullSample } = await supabase
    .from("bookings")
    .select("id, type, activity_type, date, client_name")
    .is("client_id", null)
    .eq("activity_type", "alquiler")
    .limit(5);
  console.log("Sample of alquiler NULL client_id:", nullSample);
}

if (malformedCount > 0) {
  const { data: malformedSample } = await supabase
    .from("bookings")
    .select("id, date")
    .not("date", "match", "^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    .limit(5);
  console.log("Sample of malformed dates:", malformedSample);
}

// Bonus: distribution of activity_type for context
const { data: activityTypes } = await supabase
  .from("bookings")
  .select("activity_type", { count: "exact" });
const dist = {};
activityTypes?.forEach((r) => { dist[r.activity_type || "(null)"] = (dist[r.activity_type || "(null)"] || 0) + 1; });
console.log("\nActivity_type distribution:", dist);
