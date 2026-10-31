import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,primaryKey,check} from 'drizzle-orm/sqlite-core';
export const farmStates=sqliteTable('farm_states',{device:text('device').primaryKey(),state:text('state').notNull(),revision:integer('revision').notNull(),lastCommand:text('last_command').notNull()});
export const farmCommands=sqliteTable('farm_commands',{device:text('device').notNull(),id:text('id').notNull(),receipt:text('receipt').notNull()},t=>[primaryKey({columns:[t.device,t.id]})]);
// Additive V8 persistence. Legacy farm tables remain untouched migration sources.
export const siteTransactions=sqliteTable('site_transactions',{id:text('id').primaryKey(),revision:integer('revision').notNull(),token:text('token').notNull()});
export const estates=sqliteTable('estates',{device:text('device').primaryKey(),state:text('state').notNull()});
export const estateCommands=sqliteTable('estate_commands',{device:text('device').notNull(),id:text('id').notNull(),receipt:text('receipt').notNull()},t=>[primaryKey({columns:[t.device,t.id]})]);
export const convoyRooms=sqliteTable('convoy_rooms',{id:text('id').primaryKey(),state:text('state').notNull()});
export const convoyReceipts=sqliteTable('convoy_receipts',{device:text('device').notNull(),id:text('id').notNull(),receipt:text('receipt').notNull()},t=>[primaryKey({columns:[t.device,t.id]})]);
export const harvestShares=sqliteTable('harvest_shares',{owner:text('owner').notNull(),profile:text('profile').notNull(),runId:text('run_id').notNull(),token:text('token').notNull().unique(),opened:integer('opened').notNull(),ledger:text('ledger').notNull()},t=>[primaryKey({columns:[t.owner,t.profile,t.runId]})]);
export const harvestReceipts=sqliteTable('harvest_receipts',{device:text('device').notNull(),id:text('id').notNull(),receipt:text('receipt').notNull()},t=>[primaryKey({columns:[t.device,t.id]})]);
export const harvestLimits=sqliteTable('harvest_limits',{device:text('device').notNull(),role:text('role').notNull(),day:text('day').notNull(),used:integer('used').notNull()},t=>[primaryKey({columns:[t.device,t.role,t.day]})]);

// V27 additive account authority. Existing legacy tables and history are retained.
// These tables are migration-owned; runtime initialization writes gate data only.
export const minimalTransactionGate=sqliteTable('minimal_transaction_gate',{id:text('id').primaryKey(),revision:integer('revision').notNull(),token:text('token').notNull()});
export const minimalProfiles=sqliteTable('minimal_profiles',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_profiles_valid_json',sql`json_valid(${t.value})`)]);
export const minimalFarms=sqliteTable('minimal_farms',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_farms_valid_json',sql`json_valid(${t.value})`)]);
export const minimalReceipts=sqliteTable('minimal_receipts',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_receipts_valid_json',sql`json_valid(${t.value})`)]);
export const minimalImports=sqliteTable('minimal_imports',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_imports_valid_json',sql`json_valid(${t.value})`)]);
export const minimalImportSources=sqliteTable('minimal_import_sources',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_import_sources_valid_json',sql`json_valid(${t.value})`)]);
export const minimalWishingOffers=sqliteTable('minimal_wishing_offers',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_wishing_offers_valid_json',sql`json_valid(${t.value})`)]);
export const minimalWishingDaily=sqliteTable('minimal_wishing_daily',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_wishing_daily_valid_json',sql`json_valid(${t.value})`)]);
export const minimalWishingTrades=sqliteTable('minimal_wishing_trades',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_wishing_trades_valid_json',sql`json_valid(${t.value})`)]);

// Additive real-account boarding; private reservation rows share the existing CAS.
export const minimalBoardings=sqliteTable('minimal_boardings',{key:text('key').primaryKey(),value:text('value').notNull()},t=>[check('minimal_boardings_valid_json',sql`json_valid(${t.value})`)]);
