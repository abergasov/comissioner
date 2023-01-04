import { describe } from "@jest/globals"
import { GasHistoryRepo } from "../../repository/gasHistory/repo"
import { AlchemyWeb3 } from "@alch/alchemy-web3"
import { GasStation } from "./gasStation"
import { gasData } from "../../models/gasData"

interface testCase {
	name: string
	mockedBlocks: gasData[]
	mockFee: number
	expectedDecision: boolean
}

describe("decideIsPriceGood", () => {
	const mockRepo: { loadAllBlocks: jest.Mock } = {
		loadAllBlocks: jest.fn(),
	}

	const mockAlchemyWeb3: jest.Mocked<AlchemyWeb3> = {
		eth: {
			getBlock: jest.fn(),
		},
	}
	const gasStation = new GasStation(mockRepo as unknown as GasHistoryRepo, mockAlchemyWeb3)
	const table: testCase[] = [
		{
			name: "no blocks in history",
			mockedBlocks: [],
			mockFee: 10,
			expectedDecision: false,
		},
		{
			name: "one block in history and empty fee",
			mockedBlocks: [{ blockId: 1, baseFee: 10 }],
			mockFee: 0,
			expectedDecision: false,
		},
		{
			name: "fee is less than in history",
			mockedBlocks: [
				{ blockId: 1, baseFee: 10 },
				{ blockId: 2, baseFee: 11 },
			],
			mockFee: 9,
			expectedDecision: true,
		},
		{
			name: "fee is more than in history",
			mockedBlocks: [
				{ blockId: 1, baseFee: 10 },
				{ blockId: 2, baseFee: 11 },
			],
			mockFee: 12,
			expectedDecision: false,
		},
		{
			name: "fee is equal to in history",
			mockedBlocks: [
				{ blockId: 1, baseFee: 10 },
				{ blockId: 2, baseFee: 11 },
			],
			mockFee: 11,
			expectedDecision: false,
		},
		{
			name: "fee is less than 50% of in history",
			mockedBlocks: [
				{ blockId: 1, baseFee: 10 },
				{ blockId: 2, baseFee: 11 },
				{ blockId: 3, baseFee: 13 },
				{ blockId: 4, baseFee: 14 },
			],
			mockFee: 12,
			expectedDecision: false,
		},
		{
			name: "fee is less than 75% of in history",
			mockedBlocks: [
				{ blockId: 1, baseFee: 10 },
				{ blockId: 2, baseFee: 12 },
				{ blockId: 3, baseFee: 13 },
				{ blockId: 4, baseFee: 14 },
			],
			mockFee: 11,
			expectedDecision: false,
		},
		{
			name: "fee is less than 76% of in history",
			mockedBlocks: [
				{ blockId: 1, baseFee: 10 },
				{ blockId: 2, baseFee: 12 },
				{ blockId: 3, baseFee: 13 },
				{ blockId: 4, baseFee: 14 },
				{ blockId: 4, baseFee: 15 },
			],
			mockFee: 11,
			expectedDecision: true,
		},
	]

	test.each(table.map((testCase) => [testCase.name, testCase]))("%s", async (_, tCase) => {
		mockRepo.loadAllBlocks = jest.fn().mockReturnValueOnce(tCase.mockedBlocks)
		await gasStation.loadGasValueFromHistory()
		const result = gasStation.decideIsPriceGood(tCase.mockFee)
		expect(result).toBe(tCase.expectedDecision)
	})
})
