import { Database } from "sqlite3"
import { poolData } from "../../models/poolData"

export class AddressPoolsRepo {
	private readonly db: Database
	private static TABLE_NAME = "user_pools"

	constructor(db: Database) {
		this.db = db
	}

	public async markPoolAsDeactivated(address: string, poolId: number): Promise<Error | null> {
		const sql = `UPDATE ${AddressPoolsRepo.TABLE_NAME} SET pool_active = 0 WHERE address = ? AND pool_index = ?`
		return new Promise((resolve) => {
			this.db.run(sql, [address, poolId], (err) => {
				resolve(err)
			})
		})
	}

	public async addPool(pool: poolData): Promise<void> {
		const poolActive = pool.active ? 1 : 0
		const sql = `INSERT INTO ${AddressPoolsRepo.TABLE_NAME} (address, pool_index, pool_id, pool_active, pool_meta) VALUES (?, ?, ?, ?, ?) ON CONFLICT (address, pool_index) DO UPDATE SET pool_active = ?, pool_meta = ?`
		return new Promise((resolve) => {
			this.db.run(
				sql,
				[pool.address, pool.poolIndex, pool.poolId, poolActive, pool.poolMeta, poolActive, pool.poolMeta],
				(err) => {
					if (err) {
						throw new Error("error load existing pools: " + err.message)
					}
					resolve()
				}
			)
		})
	}

	public async loadActivePools(address: string): Promise<Map<number, poolData>> {
		const sql = `SELECT * FROM ${AddressPoolsRepo.TABLE_NAME} WHERE address = ? AND pool_active = 1 ORDER BY pool_index ASC`
		return this.loadPools(sql, [address])
	}

	public async loadAllPools(address: string): Promise<Map<number, poolData>> {
		const sql = `SELECT * FROM ${AddressPoolsRepo.TABLE_NAME} WHERE address = ? ORDER BY pool_index ASC`
		return this.loadPools(sql, [address])
	}

	private async loadPools(sql: string, params: string[]): Promise<Map<number, poolData>> {
		return new Promise((resolve) => {
			this.db.all(sql, params, (err, rows) => {
				const result = new Map<number, poolData>()
				if (err) {
					throw new Error("error load pools: " + err.message)
				}
				for (const row of rows) {
					result.set(row.pool_index, {
						address: row.address,
						poolIndex: row.pool_index,
						poolId: row.pool_id,
						poolMeta: row.pool_meta,
						active: row.pool_active === 1,
					})
				}
				resolve(result)
			})
		})
	}
}
