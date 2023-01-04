import { Provider } from "@ethersproject/abstract-provider"
import { Contract, ethers } from "ethers"
import { NONFUNGIBLE_POSITION_MANAGER_ADDRESSES, V3_CORE_FACTORY_ADDRESSES } from "../../constants/uniswap/addresses"
import { abi as IUniswapV3NFTManagerABI } from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json"
import { abi as IUniswapV3PoolStateABI } from "@uniswap/v3-core/artifacts/contracts/interfaces/pool/IUniswapV3PoolState.sol/IUniswapV3PoolState.json"

// getNFTManager
export function getNFTManager(chainId: number, provider: Provider): Contract {
	return new ethers.Contract(NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId], IUniswapV3NFTManagerABI, provider)
}

// getPoolStateManagerForAddress is used to get position details
export function getPoolStateManagerForAddress(provider: Provider, address: string): Contract {
	return new ethers.Contract(address, IUniswapV3PoolStateABI, provider)
}
