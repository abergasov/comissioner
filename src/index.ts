import { gasPriceResolverV3 } from "./service/gasoline/checker_v3"
import { notifyTelegram } from "./utils/telegramNotifyer"
import { SupportedChainId } from "./constants/uniswap/chains"
import { SqliteConnector } from "./storage/database/sqlite3"
import { GasHistoryRepo } from "./repository/gasHistory/repo"
import { GasStation } from "./service/gasoline/gasStation"
import { createAlchemyWeb3 } from "@alch/alchemy-web3"
import { ethers } from "ethers"
import { UniPooler } from "./service/uniswap/uniPooler"
import { AddressPoolsRepo } from "./repository/addressPools/repo"
import { PoolsRepo } from "./repository/pools/repo"
import { TokenPricer } from "./service/pricer/tokenPricer"
import {FeeLogerRepo} from "./repository/feeLog/repo";
/* eslint-disable */
require("dotenv").config()

export async function index(): Promise<void> {
	if (!process.env.ALCHEMY_RPC_URL) {
		throw new Error("ALCHEMY_RPC_URL is not set. This rpc is used to get gas history")
	}
	if (!process.env.ADDRESS) {
		throw new Error("ADDRESS is not set. This is used to get positions")
	}

	console.log("init database and migrate tables")
	const db = new SqliteConnector(process.cwd(), SqliteConnector.DB_PATH)
	await db.migrate()

	console.log("database repository initialization...")
	const gasHistoryRepo = new GasHistoryRepo(db.connect())
	const addressPoolsRepo = new AddressPoolsRepo(db.connect())
	const poolsRepo = new PoolsRepo(db.connect())
	const feedLog = new FeeLogerRepo(db.connect())

	console.log("web3 providers initialization...")
	const web3 = createAlchemyWeb3(process.env.ALCHEMY_RPC_URL)
	const etherscanProvider = new ethers.providers.EtherscanProvider(
		SupportedChainId.MAINNET,
		process.env.ETHERSCAN_API_KEY || ""
	)

	console.log("app services initialization...")
	const pricer = new TokenPricer(process.env.CRYPTOCOMPARE_API_KEY || "")
	pricer.addTokenToWatch("ETH")
	const uniPooler = new UniPooler(SupportedChainId.MAINNET, addressPoolsRepo, poolsRepo, etherscanProvider, pricer, feedLog)
	const gasStation = new GasStation(gasHistoryRepo, web3)

	console.log("app state preparation...")
	console.log("load address pools positions")
	await uniPooler.loadAddressPools(process.env.ADDRESS)
	uniPooler.observePools()

	// handle new blocks and store gas price to history
	web3.eth.subscribe("newBlockHeaders", (err, result) => {
		if (err) {
			throw new Error("error while subscribe to new block: " + err.message)
		}
		console.log(`==================== new block ${result.number} ====================`)
		if (result.baseFeePerGas) {
			gasStation.handleNewBlock(result.number, result.baseFeePerGas)
		}
	})
	console.log("load missed block price to history")
	await gasStation.checkMissedHistory()

	// process.on("SIGTERM", () => {
	// 	console.log("SIGTERM signal received. Closing db connect.")
	// 	db.close()
	// })
	notifyTelegram("comissioner service started")
	await gasPriceResolverV3(etherscanProvider, web3, gasStation, uniPooler)
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
