import { Database } from "sqlite3"
import path from "path"

export class sqliteConnector {
	private static DB_PATH = "data/storage.db"

	private readonly dbPath: string
	private readonly db: Database | undefined
	private migrated = false

	constructor() {
		this.dbPath = path.join(process.cwd(), sqliteConnector.DB_PATH)
		this.db = new Database(this.dbPath)
	}

	public async migrate() {
		const sqlMigrations: string[] = [
			`CREATE TABLE IF NOT EXISTS gas_history (blockId INTEGER PRIMARY KEY, baseFee REAL)`,
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
