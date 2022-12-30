import { getNFTManager } from "./managers"
import { ethers } from "ethers"
import { AddressPoolsRepo } from "../../repository/addressPools/repo"
import { AlchemyWeb3 } from "@alch/alchemy-web3"
import {poolData, poolMeta} from "../../models/poolData"

export class AddressPools {
	private readonly repository: AddressPoolsRepo
	private readonly web3: AlchemyWeb3
	private readonly provider: ethers.providers.EtherscanProvider

	constructor(repo: AddressPoolsRepo, web3: AlchemyWeb3, provider: ethers.providers.EtherscanProvider) {
		this.web3 = web3
		this.provider = provider
		this.repository = repo
	}

	public async getPositions(address: string, chainId: number): Promise<Map<number, poolData>> {
		console.log("get positions for address: " + address)
		const existingPools = await this.repository.loadAllPools(address)
		const positionManager = getNFTManager(chainId, this.provider)
		const balanceResult = await positionManager.callStatic.balanceOf(address)
		console.log("found positions: " + balanceResult.toString())

		const tokenIds = []
		for (let i = 0; i < balanceResult?.toNumber(); i++) {
			const poolData = existingPools.get(i)
			if (poolData && !poolData.active) {
				continue
			}
			const poolId = await positionManager.callStatic.tokenOfOwnerByIndex(address, i)
			tokenIds.push([i, poolId.toNumber()])
			console.log(`found pool id: ${poolId.toString()}`)
		}
		for (let i = 0; i < tokenIds.length; i++) {
			console.log(`load pool data for token id: ${tokenIds[i][0]}, number: ${tokenIds[i][1]}`)
			const result = await positionManager.callStatic.positions(tokenIds[i][1])

			const poolMeta: poolMeta = {
				fee: result.fee,
				feeGrowthInside0LastX128: result.feeGrowthInside0LastX128,
				feeGrowthInside1LastX128: result.feeGrowthInside1LastX128,
				liquidity: result.liquidity,
				nonce: result.nonce,
				operator: result.operator,
				tickLower: result.tickLower,
				tickUpper: result.tickUpper,
				token0: result.token0,
				token1: result.token1,
				tokensOwed0: result.tokensOwed0,
				tokensOwed1: result.tokensOwed1,
			}
			await this.repository.addPool({
				address: address,
				poolId: tokenIds[i][1],
				poolIndex: tokenIds[i][0],
				active: result.liquidity.gt(0),
				poolMeta: JSON.stringify(poolMeta),
			})
		}
		return this.repository.loadActivePools(address)
	}
}
