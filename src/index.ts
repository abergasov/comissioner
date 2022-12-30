import { gasPriceResolverV3 } from "./service/gasoline/checker_v3"
import { notifyTelegram } from "./utils/telegramNotifyer"
import { SupportedChainId } from "./constants/uniswap/chains"
import { sqliteConnector } from "./storage/database/sqlite3"
import { GasHistoryRepo } from "./repository/gasHistory/repo"
import { GasStation } from "./service/gasoline/gasStation"
import { createAlchemyWeb3 } from "@alch/alchemy-web3"
import { ethers } from "ethers"
import { AddressPools } from "./service/uniswap/addressPools"
import { AddressPoolsRepo } from "./repository/addressPools/repo"
/* eslint-disable */
require("dotenv").config()

export async function index(): Promise<void> {
	if (!process.env.ALCHEMY_RPC_URL) {
		throw new Error("ALCHEMY_RPC_URL is not set. This rpc is used to get gas history")
	}
	if (!process.env.ADDRESS) {
		throw new Error("ADDRESS is not set. This is used to get positions")
	}

	const db = new sqliteConnector()
	await db.migrate()

	const gasHistoryRepo = new GasHistoryRepo(db.connect())
	const poolRepo = new AddressPoolsRepo(db.connect())

	const web3 = createAlchemyWeb3(process.env.ALCHEMY_RPC_URL)
	const etherscanProvider = new ethers.providers.EtherscanProvider(
		SupportedChainId.MAINNET,
		process.env.ETHERSCAN_API_KEY || ""
	)

	const addressPool = new AddressPools(poolRepo, web3, etherscanProvider)
	await addressPool.getPositions(process.env.ADDRESS, SupportedChainId.MAINNET)

	notifyTelegram("comissioner service started")

	// process.on("SIGTERM", () => {
	// 	console.log("SIGTERM signal received. Closing db connect.")
	// 	db.close()
	// })

	const gasStation = new GasStation(gasHistoryRepo, web3)
	web3.eth.subscribe("newBlockHeaders", (err, result) => {
		if (err) {
			throw new Error("error while subscribe to new block: " + err.message)
		}
		console.log(`==================== new block ${result.number} ====================`)
		if (result.baseFeePerGas) {
			gasStation.handleNewBlock(result.number, result.baseFeePerGas)
		}
	})
	await gasStation.checkMissedHistory()

	await gasPriceResolverV3(SupportedChainId.MAINNET, etherscanProvider, web3, gasStation)
	return Promise.resolve()
}

try {
	index()
} catch (e: any) {
	console.error("Error while running comissions observer: ", e)
	notifyTelegram("Error while running comissions observer: " + e.message)
} finally {
	notifyTelegram("comissioner service stopped")
}
