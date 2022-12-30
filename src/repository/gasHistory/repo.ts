import { Database } from "sqlite3"
import { gasData } from "../../models/gasData"

export class GasHistoryRepo {
	private readonly db: Database
	private static TABLE_NAME = "gas_history"

	constructor(db: Database) {
		this.db = db
	}

	public async deleteBlocksBefore(before: number): Promise<Error | null> {
		const sql = `DELETE FROM ${GasHistoryRepo.TABLE_NAME} WHERE blockId < ?`
		return new Promise((resolve) => {
			this.db.run(sql, [before], (err) => {
				if (err) {
					resolve(err)
				}
				resolve(null)
			})
		})
	}

	public async getGasData(from: number, to: number): Promise<Map<number, number>> {
		const sql = `SELECT * FROM ${GasHistoryRepo.TABLE_NAME} WHERE blockId >= ? AND blockId <= ? ORDER BY blockId ASC`
		return new Promise((resolve) => {
			this.db.all(sql, [from, to], (err, rows) => {
				const result = new Map<number, number>()
				if (err) {
					throw new Error("can't get gas history from db: " + err.message)
				} else {
					for (const row of rows) {
						result.set(row.blockId, row.baseFee)
					}
					resolve(result)
				}
			})
		})
	}

	// addGasData save data about fees into storage for future decisions
	public async addGasData(payload: gasData[]): Promise<Error | null> {
		const sql = `INSERT INTO ${GasHistoryRepo.TABLE_NAME} (blockId, baseFee)`
		const sqlAppend: string[] = []
		const sqlParams: number[] = []
		for (const item of payload) {
			sqlAppend.push("(?, ?)")
			sqlParams.push(item.blockId, item.baseFee)
		}
		return new Promise((resolve) => {
			this.db.run(
				sql + " VALUES " + sqlAppend.join(", ") + ` ON CONFLICT(blockId) DO NOTHING`,
				sqlParams,
				(err) => {
					resolve(err)
				}
			)
		})
	}

	public async loadAllBlocks(): Promise<gasData[]> {
		const sql = `SELECT * FROM ${GasHistoryRepo.TABLE_NAME} ORDER BY blockId ASC`
		return new Promise((resolve) => {
			this.db.all(sql, (err, rows) => {
				const result: gasData[] = []
				if (err) {
					throw new Error("can't get gas history from db: " + err.message)
				}
				for (const row of rows) {
					result.push({ blockId: row.blockId, baseFee: row.baseFee })
				}
				resolve(result)
			})
		})
	}
}
