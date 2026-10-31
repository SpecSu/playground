-- Additive only. Never drops or rewrites browser/legacy farm data.
CREATE TABLE IF NOT EXISTS minimal_transaction_gate (id TEXT PRIMARY KEY NOT NULL, revision INTEGER NOT NULL, token TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS minimal_profiles (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_farms (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_receipts (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_imports (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_import_sources (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_wishing_offers (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_wishing_daily (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_wishing_trades (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
CREATE TABLE IF NOT EXISTS minimal_boardings (key TEXT PRIMARY KEY NOT NULL,value TEXT NOT NULL CHECK(json_valid(value)));
