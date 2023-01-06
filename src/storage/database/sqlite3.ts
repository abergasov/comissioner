import { Database } from "sqlite3"
import path from "path"

export class SqliteConnector {
	public static DB_PATH = "data/storage.db"

	private readonly dbPath: string
	private readonly db: Database | undefined
	private migrated = false

	constructor(dbFolder: string, dbName: string) {
		this.dbPath = path.join(dbFolder, dbName)
		this.db = new Database(this.dbPath)
	}

	public async migrate() {
		const sqlMigrations: string[] = [
			`CREATE TABLE IF NOT EXISTS gas_history (block_id INTEGER PRIMARY KEY, base_fee REAL)`,
			`CREATE TABLE IF NOT EXISTS user_pools
			(
				address      TEXT,
				pool_index   INTEGER,
				pool_id   	 INTEGER,
				pool_active  INTEGER,
				pool_meta    TEXT,
				constraint user_pools_pk
					primary key (address, pool_index)
			)`,
			`CREATE TABLE IF NOT EXISTS uniswap_pools
			(
				chain_id        INTEGER,
				factory_address TEXT,
				token0          TEXT,
				token1          TEXT,
				pool_fee 		REAL,
				pool_address    TEXT,
				pool_name       TEXT,
				constraint uniswap_pools_pk
					primary key (chain_id, factory_address, token1, token0, pool_fee)
			)`,
			`CREATE TABLE IF NOT EXISTS fees_collecting_log
			(
				tx_hash               TEXT
					constraint fees_collecting_log_pk
						primary key,
				pool_id               INTEGER,
				created_at            TEXT,
				token_a               TEXT,
				token_b               TEXT,
				token_a_amount_before TEXT,
				token_b_amount_before TEXT,
				token_a_amount_after  TEXT,
				token_b_amount_after  TEXT
			)`,
			`CREATE INDEX IF NOT EXISTS fees_collecting_log_pool_id_index on fees_collecting_log (pool_id)`,
		]
		for (const sql of sqlMigrations) {
			this.db?.exec(sql)
		}
		this.migrated = true
	}

	public connect(): Database {
		if (!this.migrated) {
			throw new Error("Database is not migrated")
		}
		return this.db as Database
	}

	public close() {
		this.db?.close()
	}
}
