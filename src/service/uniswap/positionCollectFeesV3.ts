import { FeeData } from "@ethersproject/providers"
import { PoolState } from "../../constants/uniswap/pools"
import { ethers } from "ethers"
import { getNFTManager } from "./managers"
import { MAX_UINT128 } from "../../constants/constants"
import { notifyTelegram } from "../../utils/telegramNotifyer"
import { PoolContainer } from "./uniPooler"

export async function collectFees(
	chainId: number,
	provider: ethers.providers.Provider,
	poolId: number,
	container: PoolContainer,
	fees: FeeData
): Promise<string | Error> {
	if (container.poolState !== PoolState.EXISTS) {
		throw new Error(`pool ${poolId} not exists`)
	}
	if (process.env.PRIVATE_KEY === undefined) {
		throw new Error("PRIVATE_KEY is not defined")
	}

	const walletPrivateKey = new ethers.Wallet(process.env.PRIVATE_KEY)
	const signer = walletPrivateKey.connect(provider)
	const nftManagerContract = getNFTManager(chainId, signer)

	const tokenIdHexString = ethers.BigNumber.from(poolId)?.toHexString()
	console.log(`collecting fees for pool ${poolId} with token id ${tokenIdHexString}`)

	return new Promise((resolve, reject) => {
		if (!(tokenIdHexString && process.env.ADDRESS)) {
			reject(new Error("token id or address is not defined"))
		}
		nftManagerContract
			.collect(
				{
					tokenId: tokenIdHexString,
					recipient: process.env.ADDRESS,
					amount0Max: MAX_UINT128,
					amount1Max: MAX_UINT128,
				},
				{
					maxFeePerGas: fees.maxFeePerGas,
					maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
				}
			)
			.then((tx: any) => {
				notifyTelegram(`collect fees for pool ${poolId} mined. tx: https://etherscan.io/tx/${tx.hash}`)
				resolve(tx.hash)
			})
			.catch((err: Error) => {
				notifyTelegram(`error collecting fees for pool ${poolId}: ${err.message}`)
				reject(err)
			})
	})
}
