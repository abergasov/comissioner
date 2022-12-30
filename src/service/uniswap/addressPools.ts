import { getNFTManager } from "./managers"
import { ethers } from "ethers"
import { AddressPoolsRepo } from "../../repository/addressPools/repo"
import { AlchemyWeb3 } from "@alch/alchemy-web3"
import { poolData, poolMeta } from "../../models/poolData"
import { PoolsRepo } from "../../repository/pools/repo"
import { computePoolAddress, FeeAmount } from "@uniswap/v3-sdk"
import { V3_CORE_FACTORY_ADDRESSES } from "../../constants/uniswap/addresses"
import { getTokenByAddress } from "../../constants/uniswap/supportedTokens"
import { getPositionDetailsV3 } from "./positionDetailsV3"

export class AddressPools {
	private readonly addressPoolsRepo: AddressPoolsRepo
	private readonly poolsRepo: PoolsRepo
	private readonly web3: AlchemyWeb3
	private readonly provider: ethers.providers.EtherscanProvider

	constructor(
		repo: AddressPoolsRepo,
		poolsRepo: PoolsRepo,
		web3: AlchemyWeb3,
		provider: ethers.providers.EtherscanProvider
	) {
		this.web3 = web3
		this.provider = provider
		this.addressPoolsRepo = repo
		this.poolsRepo = poolsRepo
	}

	public async getPositions(address: string, chainId: number): Promise<Map<number, poolData>> {
		console.log("get positions for address: " + address)
		const existingPools = await this.addressPoolsRepo.loadAllPools(address)
		const positionManager = getNFTManager(chainId, this.provider)
		const balanceResult = await positionManager.callStatic.balanceOf(address)
		console.log("found positions: " + balanceResult.toString())

		for (let i = 0; i < balanceResult?.toNumber(); i++) {
			const poolData = existingPools.get(i)
			if (poolData && !poolData.active) {
				continue
			}
			const poolId = await positionManager.callStatic.tokenOfOwnerByIndex(address, i)
			console.log(`load pool data for token id: ${i}, number: ${poolId.toString()}...`)
			const result = await positionManager.callStatic.positions(poolId.toNumber())
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
			await this.addressPoolsRepo.addPool({
				address: address,
				poolId: poolId.toNumber(),
				poolIndex: i,
				active: result.liquidity.gt(0),
				poolMeta: JSON.stringify(poolMeta),
			})
			await this.getPool(chainId, poolId.toNumber(), poolMeta)
		}
		return this.addressPoolsRepo.loadActivePools(address)
	}

	private async getPool(chainId: number, poolId: number, poolMeta: poolMeta): Promise<void> {
		const factoryAddress = V3_CORE_FACTORY_ADDRESSES[chainId]
		const address = await this.poolsRepo.getPoolAddress(
			chainId,
			factoryAddress,
			poolMeta.token0,
			poolMeta.token1,
			poolMeta.fee
		)
		if (!address) {
			const tokenA = await getTokenByAddress(chainId, poolMeta.token0)
			const tokenB = await getTokenByAddress(chainId, poolMeta.token1)
			if (!tokenA || !tokenB) {
				throw new Error(`could not find token for address: ${poolMeta.token0} or ${poolMeta.token1}`)
			}
			const positionDetails = await getPositionDetailsV3(getNFTManager(chainId, this.provider), poolId)
			if (!positionDetails.fee) {
				throw new Error(`could not find position details for pool: ${poolId}`)
			}
			const address = computePoolAddress({
				factoryAddress: factoryAddress,
				tokenA: tokenA,
				tokenB: tokenB,
				fee: positionDetails.fee as FeeAmount,
			})
			if (!address) {
				throw new Error(`could not compute pool address for pool: ${poolId}`)
			}
			const poolName = `${tokenA.symbol}-${tokenB.symbol} ${positionDetails.fee / 10000}%`
			await this.poolsRepo.addPool(
				chainId,
				factoryAddress,
				address,
				poolMeta.token0,
				poolMeta.token1,
				poolMeta.fee,
				poolName
			)
		}
		return new Promise((resolve) => {
			resolve()
		})
	}
}
