import { BigNumber } from "@ethersproject/bignumber"
import { ethers } from "ethers"

export interface PositionDetailsV3 {
	nonce: BigNumber
	tokenId: BigNumber
	operator: string
	token0: string
	token1: string
	fee: number
	tickLower: number
	tickUpper: number
	liquidity: BigNumber
	feeGrowthInside0LastX128: BigNumber
	feeGrowthInside1LastX128: BigNumber
	tokensOwed0: BigNumber
	tokensOwed1: BigNumber
}

export async function getPositionDetailsV3(
	positionManager: ethers.Contract,
	tokenId: number
): Promise<PositionDetailsV3> {
	// see https://etherscan.io/address/0xC36442b4a4522E871399CD717aBDD847Ab11FE88#readContract method `positions`
	const results = await positionManager.callStatic.positions(tokenId)
	return results as PositionDetailsV3
}
