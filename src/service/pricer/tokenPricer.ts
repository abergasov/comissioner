import BigNumber from "bignumber.js"

export class TokenPricer {
	private readonly apiKey: string
	private readonly baseUrl = "https://min-api.cryptocompare.com/data/price?fsym=USD&tsyms="
	private watchTokens: Map<string, number>

	constructor(apiKey: string) {
		this.apiKey = apiKey
		this.watchTokens = new Map<string, number>()
	}

	public addTokenToWatch(token: string) {
		if (token) {
			this.watchTokens.set(token, 0)
		}
	}

	public getTokenPrice(token: string): BigNumber {
		return new BigNumber(this.watchTokens.get(token) || 0)
	}

	public async startCollectPrices() {
		for (;;) {
			try {
				console.log("start observing tokens price")
				await this.fetchPrices()
			} catch (error) {
				console.error("Error when updating token prices", error)
			}
			await new Promise((r) => setTimeout(r, 60 * 1000)) // wait minute
		}
	}

	private async fetchPrices() {
		const tokenList: string[] = []
		for (const [key, _] of this.watchTokens) {
			tokenList.push(key)
		}
		const tokenPrices = await fetch(this.baseUrl + tokenList.join(",")).then((response) => response.json())
		for (const [key, _] of this.watchTokens) {
			this.watchTokens.set(key, tokenPrices[key])
		}
	}
}
