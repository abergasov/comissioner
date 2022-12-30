import { ethers, utils } from "ethers"
import { Currency, CurrencyAmount } from "@uniswap/sdk-core"
import { getPool, PoolState } from "../uniswap/poolCache"
import { getPositionDetailsV3 } from "../uniswap/positionDetailsV3"
import { getNFTManager } from "../uniswap/managers"
import { getPositionFeesV3 } from "../uniswap/positionFeesV3"
import { NonfungiblePositionManager } from "@uniswap/v3-sdk"
import { calculateEtherCost } from "../../utils/gasoline"
import { getTokenByAddress, getUniTokens } from "../../constants/uniswap/supportedTokens"
import { AlchemyWeb3 } from "@alch/alchemy-web3"
import { EthDenomination, toNormalizedDenomination } from "../../utils/convert"
import BigNumber from "bignumber.js"
import { GasStation } from "./gasStation"
import { BlockHeader } from "web3-eth"
import { notifyTelegram } from "../../utils/telegramNotifyer"

export async function gasPriceResolverV3(
	chainId: number,
	etherscanProvider: ethers.providers.EtherscanProvider,
	web3: AlchemyWeb3,
	gasStation: GasStation
): Promise<void> {
	await getUniTokens()
	web3.eth.subscribe("newBlockHeaders", (err, result) => {
		if (err) {
			throw new Error("error while subscribe to new block: " + err.message)
		}

		const baseFee = new BigNumber((result.baseFeePerGas ?? 0).toString())
		const currentBaseFee = toNormalizedDenomination[EthDenomination.GWEI](baseFee)
		if (gasStation.decideIsPriceGood(currentBaseFee.toNumber())) {
			console.log("Current base fee is good: ", currentBaseFee.toNumber())
			calculatePrices(chainId, etherscanProvider, result)
		}
	})
	for (let i = 0; i < 3000; i++) {
		// sleep some time
		await new Promise((resolve) => setTimeout(resolve, 1000))
	}
}

async function calculatePrices(
	chainId: number,
	provider: ethers.providers.EtherscanProvider,
	blockHeader: BlockHeader
) {
	const [fees, ethPrice, [feeValue0, feeValue1]] = await Promise.all([
		provider.getFeeData(),
		provider.getEtherPrice(),
		getUniswapPositionFees(parseInt(process.env.POSITION_ID ?? ""), chainId, provider),
	])

	if (!(feeValue0 && feeValue1)) {
		return
	}

	const nftManagerContract = getNFTManager(chainId, provider)
	// estimate gas for collect method
	// see https://etherscan.io/address/0xC36442b4a4522E871399CD717aBDD847Ab11FE88#writeContract
	const { calldata, value } = NonfungiblePositionManager.collectCallParameters({
		tokenId: parseInt(process.env.POSITION_ID ?? "").toString(),
		expectedCurrencyOwed0: feeValue0,
		expectedCurrencyOwed1: feeValue1,
		recipient: process.env.ADDRESS ?? "",
	})

	const functionGas = await provider.estimateGas({
		to: nftManagerContract.address,
		data: calldata,
		value,
	})

	const amountMaxFee = (fees.maxFeePerGas ?? ethers.BigNumber.from(0)).mul(functionGas)
	const amountMaxFeeETH = utils.formatUnits(amountMaxFee, "ether")
	const maxFeeInUSD = calculateEtherCost(amountMaxFeeETH, ethPrice)
	console.log(`max fee: $${maxFeeInUSD.toString()} ${amountMaxFeeETH} ETH`)

	const amountBaseFee = ethers.BigNumber.from(blockHeader.baseFeePerGas ?? 0).mul(functionGas)
	const amountBaseFeeETH = utils.formatUnits(amountBaseFee, "ether")
	const baseInUSD = calculateEtherCost(amountBaseFeeETH, ethPrice)
	console.log(`base fee: $${baseInUSD.toString()} ${amountBaseFeeETH} ETH`)
	notifyTelegram(
		[
			`Current base fee is good: `,
			`max fee: $${maxFeeInUSD.toString()} ${amountMaxFeeETH} ETH`,
			`base fee: $${baseInUSD.toString()} ${amountBaseFeeETH} ETH`,
		].join("\n")
	)
	console.log(`============================`)
}

async function getUniswapPositionFees(
	positionId: number,
	chainId: number,
	provider: ethers.providers.EtherscanProvider
): Promise<[CurrencyAmount<Currency>, CurrencyAmount<Currency>]> {
	const nftManagerContract = getNFTManager(chainId, provider)

	const positionDetails = await getPositionDetailsV3(nftManagerContract, positionId)

	const token0 = await getTokenByAddress(chainId, positionDetails.token0)
	const token1 = await getTokenByAddress(chainId, positionDetails.token1)
	if (!(token0 && token1)) {
		throw new Error("Error load position fees")
	}
	const [poolState, pool] = await getPool(chainId, provider, token0, token1, positionDetails.fee)
	if (poolState !== PoolState.EXISTS) {
		throw new Error(`Pool in wrong state: ${poolState}`)
	}
	if (!pool) {
		throw new Error("Pool not found")
	}

	const latestBlock = await provider.getBlock("latest")
	const [feeValue0, feeValue1] = await getPositionFeesV3(
		nftManagerContract,
		latestBlock.number,
		pool,
		ethers.BigNumber.from(positionId) ?? undefined,
		false
	)
	if (!(feeValue0 && feeValue1)) {
		throw new Error("Error load position fees")
	}
	return [feeValue0, feeValue1]
}
