import { Token } from "@uniswap/sdk-core"

export const UNI_LIST = "https://tokens.uniswap.org"
const uniSupportedTokes = [] as Token[]

// getUniTokens expected to be called in single thread, no race condition
export async function getUniTokens(): Promise<Token[]> {
	if (uniSupportedTokes.length > 0) return uniSupportedTokes

	const uniTokens = await fetch(UNI_LIST).then((response) => response.json())
	for (const token of uniTokens.tokens) {
		uniSupportedTokes.push(
			new Token(parseInt(token.chainId), token.address, token.decimals, token.symbol, token.name)
		)
	}
	return uniSupportedTokes
}

export async function getTokenByAddress(chainId: number, address: string): Promise<Token | undefined> {
	const tokens = await getUniTokens()
	return tokens.find((token) => token.chainId === chainId && token.address === address)
}
