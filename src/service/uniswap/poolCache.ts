import { computePoolAddress, FeeAmount, Pool } from "@uniswap/v3-sdk"
import { BigintIsh, Currency, Token } from "@uniswap/sdk-core"
import JSBI from "jsbi"
import { V3_CORE_FACTORY_ADDRESSES } from "../../constants/uniswap/addresses"
import { Provider } from "@ethersproject/abstract-provider"
import { getPoolStateManagerForAddress } from "./managers"

export enum PoolState {
	NOT_EXISTS,
	EXISTS,
	INVALID,
}

// Classes are expensive to instantiate, so this caches the recently instantiated pools.
// This avoids re-instantiating pools as the other pools in the same request are loaded.
class PoolCache {
	// Evict after 128 entries. Empirically, a swap uses 64 entries.
	private static MAX_ENTRIES = 128

	// These are FIFOs, using unshift/pop. This makes recent entries faster to find.
	private static pools: Pool[] = []
	private static addresses: { key: string; address: string }[] = []

	static getPoolAddress(factoryAddress: string, tokenA: Token, tokenB: Token, fee: FeeAmount): string {
		if (this.addresses.length > this.MAX_ENTRIES) {
			this.addresses = this.addresses.slice(0, this.MAX_ENTRIES / 2)
		}

		const { address: addressA } = tokenA
		const { address: addressB } = tokenB
		const key = `${factoryAddress}:${addressA}:${addressB}:${fee.toString()}`
		const found = this.addresses.find((address) => address.key === key)
		if (found) return found.address

		const address = {
			key,
			address: computePoolAddress({
				factoryAddress,
				tokenA,
				tokenB,
				fee,
			}),
		}
		this.addresses.unshift(address)
		return address.address
	}

	static getPool(
		tokenA: Token,
		tokenB: Token,
		fee: FeeAmount,
		sqrtPriceX96: BigintIsh,
		liquidity: BigintIsh,
		tick: number
	): Pool {
		if (this.pools.length > this.MAX_ENTRIES) {
			this.pools = this.pools.slice(0, this.MAX_ENTRIES / 2)
		}

		const found = this.pools.find(
			(pool) =>
				pool.token0 === tokenA &&
				pool.token1 === tokenB &&
				pool.fee === fee &&
				JSBI.EQ(pool.sqrtRatioX96, sqrtPriceX96) &&
				JSBI.EQ(pool.liquidity, liquidity) &&
				pool.tickCurrent === tick
		)
		if (found) return found

		const pool = new Pool(tokenA, tokenB, fee, sqrtPriceX96, liquidity, tick)
		this.pools.unshift(pool)
		return pool
	}
}

export async function getPool(
	chainId: number,
	provider: Provider,
	currencyA: Currency | undefined,
	currencyB: Currency | undefined,
	feeAmount: FeeAmount | undefined
): Promise<[PoolState, Pool | null]> {
	const poolKeys: [Currency | undefined, Currency | undefined, FeeAmount | undefined][] = [
		[currencyA, currencyB, feeAmount],
	]
	const poolTokens: ([Token, Token, FeeAmount] | undefined)[] = poolKeys.map(([currencyA, currencyB, feeAmount]) => {
		if (currencyA && currencyB && feeAmount) {
			const tokenA = currencyA.wrapped
			const tokenB = currencyB.wrapped
			if (tokenA.equals(tokenB)) return undefined

			return tokenA.sortsBefore(tokenB) ? [tokenA, tokenB, feeAmount] : [tokenB, tokenA, feeAmount]
		}
		return undefined
	})

	const v3CoreFactoryAddress = chainId && V3_CORE_FACTORY_ADDRESSES[chainId]
	const poolAddresses: (string | undefined)[] = !v3CoreFactoryAddress
		? new Array(poolTokens.length)
		: poolTokens.map((value) => value && PoolCache.getPoolAddress(v3CoreFactoryAddress, ...value))

	// contract for specific pair. for example contract for WETH|DAI pair see:
	// https://etherscan.io/address/0x60594a405d53811d3BC4766596EFD80fd545A270#readContract
	const poolStateManager = getPoolStateManagerForAddress(chainId, provider, poolAddresses[0] ?? "")

	const slot0s = await poolStateManager.callStatic.slot0()
	const liquidy = await poolStateManager.callStatic.liquidity()

	const result = poolKeys.map((_key, index) => {
		const tokens = poolTokens[index]
		if (!tokens) return [PoolState.INVALID, null]
		const [token0, token1, fee] = tokens

		if (!(slot0s && liquidy)) return [PoolState.NOT_EXISTS, null]
		if (!slot0s.sqrtPriceX96 || slot0s.sqrtPriceX96.eq(0)) return [PoolState.NOT_EXISTS, null]

		try {
			const pool = new Pool(token0, token1, fee, slot0s.sqrtPriceX96, liquidy, slot0s.tick)
			return [PoolState.EXISTS, pool]
		} catch (error) {
			console.error("Error when constructing the pool", error)
			return [PoolState.NOT_EXISTS, null]
		}
	})
	return result.length > 0 ? (result[0] as [PoolState, Pool | null]) : [PoolState.INVALID, null]
}
