import { GasHistoryRepo } from "../../repository/gasHistory/repo"
import { AlchemyWeb3 } from "@alch/alchemy-web3"
import { EthDenomination, toNormalizedDenomination } from "../../utils/convert"
import BigNumber from "bignumber.js"
import { gasData } from "../../models/gasData"

export class GasStation {
	private static BLOCK_DURATION = 10 // approximate block duration in seconds
	private static MAX_KEEP_BLOCKS = 3 * ((24 * 60 * 60) / GasStation.BLOCK_DURATION) // how many days in past store gas info
	private static BLOCK_DOWNLOAD_BATCH_SIZE = 1024
	private static PERCENTAGE = 75 // 75% of blocks should have higher price to run transaction

	private readonly repository: GasHistoryRepo
	private readonly web3: AlchemyWeb3
	private blocks: gasData[] = [] // keep history info in memory, will decide is price good or bad

	constructor(repo: GasHistoryRepo, web3: AlchemyWeb3) {
		this.repository = repo
		this.web3 = web3
	}

	// checkMissedHistory load current state of block fees in local database and download info about missed blocks
	public async checkMissedHistory() {
		const currentBlock = await this.web3.eth.getBlock("latest")
		console.log(`current block: ${currentBlock.number}`)

		const from = currentBlock.number - GasStation.MAX_KEEP_BLOCKS
		const to = currentBlock.number

		await this.repository.deleteBlocksBefore(from)

		const rows = await this.repository.getGasData(from, to)

		const missingBlocks = this.fillMissedBlocks(from, to, rows)

		console.log(`start download missing blocks...`)
		let iteration = 1
		for (const chunk of missingBlocks) {
			console.log(`iteration ${iteration} of ${missingBlocks.length}`)
			await this.downloadAndStoreBlockChunk(chunk)
			iteration++
		}
		console.log(`downloading of missed blocks finished`)
		await this.loadGasValueFromHistory()
	}

	private async downloadAndStoreBlockChunk(chunk: number[]) {
		const lastBlock = chunk[chunk.length - 1]
		const blocks = await this.web3.eth.getFeeHistory(GasStation.BLOCK_DOWNLOAD_BATCH_SIZE, lastBlock, [25, 50, 75])
		const blockLogs: gasData[] = []
		for (let i = 0; i < GasStation.BLOCK_DOWNLOAD_BATCH_SIZE; i++) {
			blockLogs.push({
				blockId: Number(blocks.oldestBlock) + i,
				baseFee: GasStation.convertToGWEI(blocks.baseFeePerGas[i]),
			})
		}
		const err = await this.repository.addGasData(blockLogs)
		if (err) {
			console.error("can't save gas history to db:")
			return
		}
		console.log(
			`processed ${blockLogs.length} blocks from ${blockLogs[0].blockId} to ${
				blockLogs[blockLogs.length - 1].blockId
			}`
		)
	}

	// handleNewBlock called when new block is mined. It should update local database with new block info
	public async handleNewBlock(block: number, baseFee: number) {
		const gasData = { blockId: block, baseFee: GasStation.convertToGWEI(baseFee.toString()) }
		const err = await this.repository.addGasData([gasData])
		if (err) {
			throw new Error("can't save gas history to db: " + err.message)
		}
		if (this.blocks.length > 0) {
			this.blocks.push(gasData)
			this.blocks.shift()
		}
	}

	// decideIsPriceGood checks if the current base fee is good according to block history
	// if the current base fee is lower than 25% of the blocks in the past, it is considered good
	public decideIsPriceGood(fee: number): boolean {
		if (this.blocks.length === 0 || fee === 0) return false
		let count = 0
		for (let i = 0; i < this.blocks.length; i++) {
			if (this.blocks[i].baseFee > fee) {
				count++
			}
		}
		console.log(`current fee: ${fee}, blocks count in observation: ${this.blocks.length}`)
		console.log(
			`current fee is less than ${count} blocks. only ${+((count * 100) / this.blocks.length).toFixed(
				2
			)}% of blocks has price more (expected ${GasStation.PERCENTAGE}%)`
		)
		if (count === this.blocks.length) return true // all blocks have higher fee
		if (count === 0) return false // all blocks have lower fee
		const percent = (this.blocks.length / 100) * GasStation.PERCENTAGE // 75% of blocks
		return count > percent // fee is less than 75% of blocks
	}

	// fillMissedBlocks search sequence of missed blocks in local database and return array of arrays of missed blocks
	private fillMissedBlocks(from: number, to: number, rows: Map<number, number>): number[][] {
		const missingBlocks: number[][] = []
		let blocksChunk: number[] = []
		let lastBlock = from
		let missedBlocksCount = 0
		for (let i = from; i <= to; i++) {
			if (rows.has(i)) {
				continue
			}
			missedBlocksCount++
			if (blocksChunk.length >= GasStation.BLOCK_DOWNLOAD_BATCH_SIZE) {
				missingBlocks.push(blocksChunk)
				blocksChunk = []
			}
			if (lastBlock + 1 === i) {
				blocksChunk.push(i)
				lastBlock = i
				continue
			}
			if (blocksChunk.length > 0) {
				missingBlocks.push(blocksChunk)
			}
			blocksChunk = [i]
			lastBlock = i
		}
		if (blocksChunk.length > 0) {
			missingBlocks.push(blocksChunk)
		}
		console.log(`missing blocks: ${missedBlocksCount}, chunks: ${missingBlocks.length}`)
		return missingBlocks
	}

	// loadGasValueFromHistory load last info about gas from storage. interval defined by MAX_KEEP_BLOCKS constant
	public async loadGasValueFromHistory(): Promise<gasData[]> {
		this.blocks = await this.repository.loadAllBlocks()
		return this.blocks
	}

	private static convertToGWEI(value: string): number {
		return toNormalizedDenomination[EthDenomination.GWEI](new BigNumber(value)).toNumber()
	}
}
