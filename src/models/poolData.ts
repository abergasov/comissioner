import { BigNumber } from "@ethersproject/bignumber"

export interface poolData {
	address: string
	poolIndex: number
	poolId: number
	active: boolean
	poolMeta: string
}

export interface poolMeta {
	fee: number
	feeGrowthInside0LastX128: BigNumber
	feeGrowthInside1LastX128: BigNumber
	liquidity: BigNumber
	nonce: BigNumber
	operator: string
	tickLower: number
	tickUpper: number
	token0: string
	token1: string
	tokensOwed0: BigNumber
	tokensOwed1: BigNumber
}
