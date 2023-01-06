import { getNFTManager, getPoolStateManagerForAddress } from "./managers"
import { ethers } from "ethers"
import { AddressPoolsRepo } from "../../repository/addressPools/repo"
import { poolData, poolMeta } from "../../models/poolData"
import { PoolsRepo } from "../../repository/pools/repo"
import { computePoolAddress, FeeAmount, NonfungiblePositionManager, Pool } from "@uniswap/v3-sdk"
import { V3_CORE_FACTORY_ADDRESSES } from "../../constants/uniswap/addresses"
import { getTokenByAddress } from "../../constants/uniswap/supportedTokens"
import { getPositionFeesV3 } from "./positionFeesV3"
import { PoolState } from "../../constants/uniswap/pools"
import { TokenPricer } from "../pricer/tokenPricer"
import BigNumber from "bignumber.js"
import { EthDenomination, toBigNumber, toNormalizedDenomination } from "../../utils/convert"
import { notifyTelegram } from "../../utils/telegramNotifyer"
import { FeeData } from "@ethersproject/providers"
import { collectFees } from "./positionCollectFeesV3"
import {feeLog, FeeLogerRepo} from "../../repository/feeLog/repo";

export interface PoolContainer {
	pool: Pool
	poolId: number
	poolState: PoolState
	poolFees: BigNumber
	collectFeesGas: BigNumber
}

// UniPooler keep in memory state of all pools and update it.
export class UniPooler {
	private readonly addressPoolsRepo: AddressPoolsRepo
	private readonly uniPools: PoolsRepo
	private readonly feedLog :FeeLogerRepo
	private readonly provider: ethers.providers.Provider
	private readonly nftManagerContract: ethers.Contract
	private readonly pricer: TokenPricer
	// service state
	private readonly chainId: number
	private activePools: Map<number, poolData>
	private web3Pools: Map<number, PoolContainer>
	private isCollecting: boolean = false

	constructor(
		chainId: number,
		repo: AddressPoolsRepo,
		poolsRepo: PoolsRepo,
		provider: ethers.providers.Provider,
		pricer: TokenPricer,
		feedLog : FeeLogerRepo
	) {
		this.chainId = chainId
		this.provider = provider
		this.addressPoolsRepo = repo
		this.uniPools = poolsRepo
		this.activePools = new Map<number, poolData>()
		this.web3Pools = new Map<number, PoolContainer>()
		this.nftManagerContract = getNFTManager(chainId, provider)
		this.pricer = pricer
		this.feedLog = feedLog
	}

	// loadAddressPools load pools for provided address. load uniswap pools from positions and create Pool objects in memory
	public async loadAddressPools(address: string): Promise<Map<number, poolData>> {
		console.log("get positions for address: " + address)
		const existingPools = await this.addressPoolsRepo.loadAllPools(address)
		const balanceResult = await this.nftManagerContract.callStatic.balanceOf(address)
		console.log("found positions: " + balanceResult.toString())

		for (let i = 0; i < balanceResult?.toNumber(); i++) {
			const poolData = existingPools.get(i)
			if (poolData && !poolData.active) {
				continue
			}
			const poolId = await this.nftManagerContract.callStatic.tokenOfOwnerByIndex(address, i)
			console.log(`load pool data for token id: ${i}, number: ${poolId.toString()}...`)
			const result = await this.nftManagerContract.callStatic.positions(poolId.toNumber())
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
				poolMeta: poolMeta,
			})
			await this.loadPoolAddress(poolId.toNumber(), poolMeta)
			// warm local storage by loading pool data
			await this.getPool(poolId.toNumber())
			const token0 = await getTokenByAddress(this.chainId, result.token0)
			const token1 = await getTokenByAddress(this.chainId, result.token1)
			if (!token0?.symbol || !token1?.symbol) {
				throw new Error("token not found")
			}
			this.pricer.addTokenToWatch(token0.symbol)
			this.pricer.addTokenToWatch(token1.symbol)
		}
		this.pricer.startCollectPrices()
		this.activePools = await this.addressPoolsRepo.loadActivePools(address)
		return this.activePools
	}

	// getPool returns the pool for the given poolId. Store pool in memory.
	public async getPool(poolId: number): Promise<[PoolState, Pool | null]> {
		if (this.web3Pools.has(poolId)) {
			const container = this.web3Pools.get(poolId) as PoolContainer
			return [container.poolState, container.pool]
		}
		const poolMeta = await this.getPoolMetaByPoolId(poolId)
		const poolAddress = await this.loadPoolAddress(poolId, poolMeta.poolMeta)
		const poolStateManager = getPoolStateManagerForAddress(this.provider, poolAddress)

		const [slot0s, liquidy] = await Promise.all([
			poolStateManager.callStatic.slot0(),
			poolStateManager.callStatic.liquidity(),
		])
		if (!(slot0s && liquidy)) return [PoolState.NOT_EXISTS, null]
		if (!slot0s.sqrtPriceX96 || slot0s.sqrtPriceX96.eq(0)) return [PoolState.NOT_EXISTS, null]

		const token0 = await getTokenByAddress(this.chainId, poolMeta.poolMeta.token0)
		const token1 = await getTokenByAddress(this.chainId, poolMeta.poolMeta.token1)
		if (!token0 || !token1) return [PoolState.NOT_EXISTS, null]

		try {
			const pool = new Pool(
				token0,
				token1,
				poolMeta.poolMeta.fee as FeeAmount,
				slot0s.sqrtPriceX96,
				liquidy,
				slot0s.tick
			)
			this.web3Pools.set(poolId, {
				pool: pool,
				poolState: PoolState.EXISTS,
				poolFees: new BigNumber("0"),
				collectFeesGas: new BigNumber("0"),
				poolId: poolId,
			})
			return [PoolState.EXISTS, pool]
		} catch (error) {
			console.error("Error when constructing the pool", error)
			return [PoolState.NOT_EXISTS, null]
		}
	}

	// getPoolMetaByPoolId returns pool meta for the given poolId.
	// look in memory first, then in the database
	private async getPoolMetaByPoolId(poolId: number): Promise<poolData> {
		// check pool in activePools
		for (const [key, value] of this.activePools) {
			if (value.poolId === poolId) {
				return value
			}
		}
		return await this.addressPoolsRepo.loadPool(poolId)
	}

	// loadPoolAddress load address of given pool. If pool is not in `uniswap_pools` table - load from network
	// after pool load from network - store it in db
	private async loadPoolAddress(poolId: number, poolMeta: poolMeta): Promise<string> {
		const factoryAddress = V3_CORE_FACTORY_ADDRESSES[this.chainId]
		let address = await this.uniPools.getPoolAddress(
			this.chainId,
			factoryAddress,
			poolMeta.token0,
			poolMeta.token1,
			poolMeta.fee
		)
		if (address) {
			return address
		}

		const tokenA = await getTokenByAddress(this.chainId, poolMeta.token0)
		const tokenB = await getTokenByAddress(this.chainId, poolMeta.token1)
		if (!tokenA || !tokenB) {
			throw new Error(`could not find token for address: ${poolMeta.token0} or ${poolMeta.token1}`)
		}

		// see https://etherscan.io/address/0xC36442b4a4522E871399CD717aBDD847Ab11FE88#readContract method `positions`
		const positionDetails = await this.nftManagerContract.callStatic.positions(poolId)
		if (!positionDetails.fee) {
			throw new Error(`could not find position details for pool: ${poolId}`)
		}
		address = computePoolAddress({
			factoryAddress: factoryAddress,
			tokenA: tokenA,
			tokenB: tokenB,
			fee: positionDetails.fee as FeeAmount,
		})
		if (!address) {
			throw new Error(`could not compute pool address for pool: ${poolId}`)
		}
		const poolName = `${tokenA.symbol}-${tokenB.symbol} ${positionDetails.fee / 10000}%`
		await this.uniPools.addPool(
			this.chainId,
			factoryAddress,
			address,
			poolMeta.token0,
			poolMeta.token1,
			poolMeta.fee,
			poolName
		)
		return address
	}

	// getPoolsWithFeesReadyToCollect returns pools with fees ready to collect.
	// every pool has 2 fees - token0 and token1.
	// check that total amount of fees X times more that gas price and it profitable to collect
	public getPoolsWithFeesReadyToCollect(
		baseGaseFee: BigNumber,
		maxGasFee: BigNumber,
		multiplyTimes: number
	): PoolContainer[] {
		const result: PoolContainer[] = []
		const tgMessage: string[] = []
		for (const [key, container] of this.web3Pools) {
			if (container.poolState !== PoolState.EXISTS) {
				continue
			}

			if (container.poolFees.isZero()) {
				console.log(`pool ${container.poolId} has no fees`)
				continue
			}
			console.log("poolId", container.poolId, "poolFees", container.poolFees.toString())
			const priorityFee = 1.5 // miners reward
			const amountMaxFee = maxGasFee.mul(priorityFee).mul(container.collectFeesGas)
			const amountBaseFee = baseGaseFee.mul(priorityFee).mul(container.collectFeesGas)

			const currentBaseFee = toNormalizedDenomination[EthDenomination.WEI](toBigNumber.dec(amountBaseFee))
			const currentMaxFee = toNormalizedDenomination[EthDenomination.WEI](toBigNumber.dec(amountMaxFee))

			const ethPrice = this.pricer.getTokenPrice("ETH")

			const baseFeeUSD = currentBaseFee.div(ethPrice)
			const maxFeeUSD = currentMaxFee.div(ethPrice)

			const p = container.poolId
			const f = container.poolFees.toFixed(2)
			const bf = baseFeeUSD.toFixed(2)
			const mf = maxFeeUSD.toFixed(2)
			const isProfitable = container.poolFees.gte(maxFeeUSD.mul(multiplyTimes))
			if (isProfitable) {
				tgMessage.push(`pool ${p}: fees: ${f}$, base fee: ${bf}$, max fee: ${mf}$`)
				result.push(container)
				// reset pool fees to avoid double collecting
				container.poolFees = new BigNumber("0")
				container.collectFeesGas = new BigNumber("0")
				break // collect fees only for one pool
			} else {
				console.log(
					`pool ${p} is not profitable to collect fees. fees: ${f}$, current base fee: ${bf}$, max fee: ${mf}$`
				)
			}
		}
		if (tgMessage.length > 0) {
			notifyTelegram(tgMessage.join("\n"))
		}
		return result
	}

	public async collectFees(poolId: number, fees: FeeData): Promise<void> {
		this.isCollecting = true
		const container = this.web3Pools.get(poolId)
		if (!container) {
			throw new Error(`pool ${poolId} not found`)
		}

		const result = await collectFees(this.chainId, this.provider, poolId, container, fees)
		if (result instanceof Error) {
			this.isCollecting = false
			return
		}
		this.isCollecting = false
	}

	public async observePools(): Promise<void> {
		for (;;) {
			if (!this.isCollecting) {
				try {
					console.log("start observing pools")
					await this.loadPoolsFees()
				} catch (error) {
					console.error("Error when updating pools", error)
				}
			}
			await new Promise((r) => setTimeout(r, 60 * 1000)) // wait minute
		}
	}

	// loadPoolsFees load pool states in background with some periodic interval
	// estimate function gas price and fees total amount
	public async loadPoolsFees(): Promise<void> {
		for (const [key, container] of this.web3Pools) {
			if (!container.pool) {
				continue
			}
			const [feeValue0, feeValue1] = await getPositionFeesV3(
				this.nftManagerContract,
				undefined,
				container.pool,
				ethers.BigNumber.from(key) ?? undefined,
				false
			)
			if (!(feeValue0 && feeValue1)) {
				throw new Error("Error load position fees")
			}

			const priceA = this.pricer.getTokenPrice(container.pool.token0.symbol || "")
			const priceB = this.pricer.getTokenPrice(container.pool.token1.symbol || "")
			if (priceA.toNumber() === 0 || priceB.toNumber() === 0) {
				continue
			}

			const fee0 = new BigNumber(feeValue0.toSignificant(6))
			const fee1 = new BigNumber(feeValue1.toSignificant(6))
			const feeUsd0 = fee0.div(priceA)
			const feeUsd1 = fee1.div(priceB)

			// estimate function gas price for collect method
			// see https://etherscan.io/address/0xC36442b4a4522E871399CD717aBDD847Ab11FE88#writeContract
			const { calldata, value } = NonfungiblePositionManager.collectCallParameters({
				tokenId: container.poolId.toString(),
				expectedCurrencyOwed0: feeValue0,
				expectedCurrencyOwed1: feeValue1,
				recipient: process.env.ADDRESS ?? "",
			})

			const functionGas = await this.provider.estimateGas({
				to: this.nftManagerContract.address,
				data: calldata,
				value,
			})

			container.poolFees = feeUsd0.add(feeUsd1)
			container.collectFeesGas = new BigNumber(functionGas.toString())
			this.web3Pools.set(key, container)
		}
	}
}
