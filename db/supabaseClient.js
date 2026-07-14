require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL e SUPABASE_SECRET_KEY precisam estar definidos no .env');
}

const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

module.exports = supabase;
