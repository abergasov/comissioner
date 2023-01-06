import { Database } from "sqlite3"

export interface feeLog {
	tx_hash: string
	pool_id: number
	created_at: string
	token_a: string
	token_b: string
	token_a_amount_before: string
	token_b_amount_before: string
	token_a_amount_after: string
	token_b_amount_after: string
}

export class FeeLogerRepo {
	private readonly db: Database
	private static TABLE_NAME = "fees_collecting_log"

	constructor(db: Database) {
		this.db = db
	}

	public async saveToFeeLog(log: feeLog): Promise<void> {
		const sql = `INSERT INTO ${FeeLogerRepo.TABLE_NAME} (tx_hash, pool_id, created_at, token_a, token_b, token_a_amount_before, token_b_amount_before, token_a_amount_after, token_b_amount_after) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		return new Promise((resolve) => {
			this.db.run(
				sql,
				[
					log.tx_hash,
					log.pool_id,
					log.created_at,
					log.token_a,
					log.token_b,
					log.token_a_amount_before,
					log.token_b_amount_before,
					log.token_a_amount_after,
					log.token_b_amount_after,
				],
				(err) => {
					if (err) {
						throw new Error("error load existing pools: " + err.message)
					}
					resolve()
				}
			)
		})
	}
}
