import { Database } from "sqlite3"
import { FeeAmount } from "@uniswap/v3-sdk"

export class PoolsRepo {
	private readonly db: Database
	private static TABLE_NAME = "uniswap_pools"

	constructor(db: Database) {
		this.db = db
	}

	public async addPool(
		chainId: number,
		factoryAddress: string,
		poolAddress: string,
		tokenA: string,
		tokenB: string,
		fee: FeeAmount,
		poolName: string
	): Promise<void> {
		const sql = `INSERT INTO ${PoolsRepo.TABLE_NAME} (chain_id, factory_address, token0, token1, pool_fee, pool_address, pool_name) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`
		const params = [chainId, factoryAddress, tokenA, tokenB, fee, poolAddress, poolName]
		return new Promise((resolve) => {
			this.db.run(sql, params, (err) => {
				if (err) {
					throw new Error("error while add uniswap pool: " + err.message)
				} else {
					resolve()
				}
			})
		})
	}

	public async getPoolAddress(
		chainId: number,
		factoryAddress: string,
		tokenA: string,
		tokenB: string,
		fee: FeeAmount
	): Promise<string | undefined> {
		const sql = `SELECT * FROM ${PoolsRepo.TABLE_NAME} WHERE chain_id = ? AND factory_address = ? AND token0 = ? AND token1 = ? AND pool_fee = ?`
		const params = [chainId, factoryAddress, tokenA, tokenB, fee]
		return new Promise((resolve) => {
			this.db.get(sql, params, (err, row) => {
				if (err) {
					throw new Error("error while load uniswap pools: " + err.message)
				} else {
					if (row) {
						resolve(row.address)
					}
					resolve(undefined)
				}
			})
		})
	}
}
