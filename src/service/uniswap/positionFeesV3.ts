import { BigNumber, ethers } from "ethers"
import { Pool } from "@uniswap/v3-sdk"
import { Currency, CurrencyAmount } from "@uniswap/sdk-core"
import { MAX_UINT128 } from "../../constants/constants"

export async function getPositionFeesV3(
	nftManagerContract: ethers.Contract,
	latestBlockNumber: number | undefined,
	pool: Pool,
	tokenId?: BigNumber,
	asWETH = false
): Promise<[CurrencyAmount<Currency>, CurrencyAmount<Currency>] | [undefined, undefined]> {
	const tokenIdHexString = tokenId?.toHexString()
	if (tokenIdHexString && process.env.ADDRESS) {
		const result = await nftManagerContract.callStatic.collect(
			{
				tokenId: tokenIdHexString,
				recipient: process.env.ADDRESS, // some tokens might fail if transferred to address(0)
				amount0Max: MAX_UINT128,
				amount1Max: MAX_UINT128,
			},
			{ from: process.env.ADDRESS } // need to simulate the call as the owner
		)
		return [
			CurrencyAmount.fromRawAmount(asWETH ? pool.token0 : unwrappedToken(pool.token0), result.amount0.toString()),
			CurrencyAmount.fromRawAmount(asWETH ? pool.token1 : unwrappedToken(pool.token1), result.amount1.toString()),
		]
	}
	return [undefined, undefined]
}

export function unwrappedToken(currency: Currency): Currency {
	if (currency.isNative) return currency
	// const formattedChainId = supportedChainId(currency.chainId)
	// if (formattedChainId && WRAPPED_NATIVE_CURRENCY[formattedChainId]?.equals(currency))
	//     return nativeOnChain(currency.chainId)
	return currency
}
