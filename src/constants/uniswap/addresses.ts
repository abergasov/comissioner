import { FACTORY_ADDRESS as V3_FACTORY_ADDRESS } from "@uniswap/v3-sdk"
import { SupportedChainId } from "./chains"

type AddressMap = { [chainId: number]: string }

export const UNI_ADDRESS: AddressMap = constructSameAddressMap("0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984")

// celo v3 addresses
const CELO_V3_CORE_FACTORY_ADDRESSES = "0xAfE208a311B21f13EF87E33A90049fC17A7acDEc"
const CELO_ROUTER_ADDRESS = "0x5615CDAb10dc425a742d643d949a7F474C01abc4"
const CELO_V3_MIGRATOR_ADDRESSES = "0x3cFd4d48EDfDCC53D3f173F596f621064614C582"
const CELO_MULTICALL_ADDRESS = "0x633987602DE5C4F337e3DbF265303A1080324204"
const CELO_QUOTER_ADDRESSES = "0x82825d0554fA07f7FC52Ab63c961F330fdEFa8E8"
const CELO_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES = "0x3d79EdAaBC0EaB6F08ED885C05Fc0B014290D95A"
const CELO_TICK_LENS_ADDRESSES = "0x5f115D9113F88e0a0Db1b5033D90D4a9690AcD3D"

export function constructSameAddressMap<T extends string>(
	address: T,
	additionalNetworks: SupportedChainId[] = []
): { [chainId: number]: T } {
	const DEFAULT_NETWORKS: SupportedChainId[] = [
		SupportedChainId.MAINNET,
		SupportedChainId.ROPSTEN,
		SupportedChainId.RINKEBY,
		SupportedChainId.GOERLI,
		SupportedChainId.KOVAN,
	]
	return DEFAULT_NETWORKS.concat(additionalNetworks).reduce<{ [chainId: number]: T }>((memo, chainId) => {
		memo[chainId] = address
		return memo
	}, {})
}

/* V3 Contract Addresses */
export const V3_CORE_FACTORY_ADDRESSES: AddressMap = {
	...constructSameAddressMap(V3_FACTORY_ADDRESS, [
		SupportedChainId.OPTIMISM,
		SupportedChainId.OPTIMISM_GOERLI,
		SupportedChainId.ARBITRUM_ONE,
		SupportedChainId.ARBITRUM_RINKEBY,
		SupportedChainId.POLYGON_MUMBAI,
		SupportedChainId.POLYGON,
	]),
	[SupportedChainId.CELO]: CELO_V3_CORE_FACTORY_ADDRESSES,
	[SupportedChainId.CELO_ALFAJORES]: CELO_V3_CORE_FACTORY_ADDRESSES,
}

export const NONFUNGIBLE_POSITION_MANAGER_ADDRESSES: AddressMap = {
	...constructSameAddressMap("0xC36442b4a4522E871399CD717aBDD847Ab11FE88", [
		SupportedChainId.OPTIMISM,
		SupportedChainId.OPTIMISM_GOERLI,
		SupportedChainId.ARBITRUM_ONE,
		SupportedChainId.ARBITRUM_RINKEBY,
		SupportedChainId.POLYGON_MUMBAI,
		SupportedChainId.POLYGON,
	]),
	[SupportedChainId.CELO]: CELO_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
	[SupportedChainId.CELO_ALFAJORES]: CELO_NONFUNGIBLE_POSITION_MANAGER_ADDRESSES,
}
