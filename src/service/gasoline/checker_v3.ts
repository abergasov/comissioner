import { ethers, utils } from "ethers"
import { getUniTokens } from "../../constants/uniswap/supportedTokens"
import { AlchemyWeb3 } from "@alch/alchemy-web3"
import { EthDenomination, toNormalizedDenomination } from "../../utils/convert"
import BigNumber from "bignumber.js"
import { GasStation } from "./gasStation"
import { BlockHeader } from "web3-eth"
import { UniPooler } from "../uniswap/uniPooler"
import { FeeData } from "@ethersproject/providers"

export async function gasPriceResolverV3(
	etherscanProvider: ethers.providers.EtherscanProvider,
	web3: AlchemyWeb3,
	gasStation: GasStation,
	uniPooler: UniPooler
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
			calculatePrices(etherscanProvider, result, uniPooler)
		}
	})
}

async function calculatePrices(
	provider: ethers.providers.EtherscanProvider,
	blockHeader: BlockHeader,
	uniPooler: UniPooler
) {
	const fees = await provider.getFeeData()

	const [baseFee, maxFee] = getBaseAndMaxFeePerGas(fees, blockHeader)
	const pools = uniPooler.getPoolsWithFeesReadyToCollect(baseFee, maxFee, +(process.env.COLLECT_FEES_AFTER_X || 10))
	if (pools.length === 0) {
		return
	}

	console.log(`try collect fees from pool: ${pools[0].poolId}`)
	await uniPooler.collectFees(pools[0].poolId, fees)

	//const nftManagerContract = getNFTManager(chainId, provider)
	// estimate gas for collect method
	// see https://etherscan.io/address/0xC36442b4a4522E871399CD717aBDD847Ab11FE88#writeContract
	// const { calldata, value } = NonfungiblePositionManager.collectCallParameters({
	// 	tokenId: parseInt(process.env.POSITION_ID ?? "").toString(),
	// 	expectedCurrencyOwed0: feeValue0,
	// 	expectedCurrencyOwed1: feeValue1,
	// 	recipient: process.env.ADDRESS ?? "",
	// })
	//
	// const functionGas = await provider.estimateGas({
	// 	to: nftManagerContract.address,
	// 	data: calldata,
	// 	value,
	// })
	// const functionGas = 1
	//
	// const amountMaxFee = (fees.maxFeePerGas ?? ethers.BigNumber.from(0)).mul(functionGas)
	// const amountMaxFeeETH = utils.formatUnits(amountMaxFee, "ether")
	// const maxFeeInUSD = calculateEtherCost(amountMaxFeeETH, ethPrice)
	// console.log(`max fee: $${maxFeeInUSD.toString()} ${amountMaxFeeETH} ETH`)
	//
	// const amountBaseFee = ethers.BigNumber.from(blockHeader.baseFeePerGas ?? 0).mul(functionGas)
	// const amountBaseFeeETH = utils.formatUnits(amountBaseFee, "ether")
	// const baseInUSD = calculateEtherCost(amountBaseFeeETH, ethPrice)
	// console.log(`base fee: $${baseInUSD.toString()} ${amountBaseFeeETH} ETH`)
	// notifyTelegram(
	// 	[
	// 		`Current base fee is good: `,
	// 		`max fee: $${maxFeeInUSD.toString()} ${amountMaxFeeETH} ETH`,
	// 		`base fee: $${baseInUSD.toString()} ${amountBaseFeeETH} ETH`,
	// 	].join("\n")
	// )
	console.log(`============================`)
}

function getBaseAndMaxFeePerGas(fees: FeeData, blockHeader: BlockHeader): [BigNumber, BigNumber] {
	const baseFee = new BigNumber((blockHeader.baseFeePerGas ?? 0).toString())
	const maxFee = new BigNumber((fees.maxFeePerGas ?? 0).toString())
	return [baseFee, maxFee]
}
