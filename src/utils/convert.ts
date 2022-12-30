import BigNumber from "bignumber.js"
import { stripHexPrefix, BN } from "ethereumjs-util"

export enum NumericBase {
	HEX = "hex",
	DEC = "dec",
	BN = "BN",
}

export enum EthDenomination {
	WEI = "WEI",
	GWEI = "GWEI",
	ETH = "ETH",
}

// Big Number Constants
const BIG_NUMBER_WEI_MULTIPLIER = new BigNumber("1000000000000000000") // 1_000_000_000_000_000_000
const BIG_NUMBER_GWEI_MULTIPLIER = new BigNumber("1000000000") // 1_000_000_000
//const BIG_NUMBER_GWEI_MULTIPLIER = new BigNumber("100000000")
const BIG_NUMBER_ETH_MULTIPLIER = new BigNumber("1")

const toBigNumber = {
	hex: (n: string | BigNumber) => new BigNumber(stripHexPrefix(n.toString()), 16),
	dec: (n: string | BigNumber) => new BigNumber(String(n), 10),
	BN: (n: string | BigNumber) => new BigNumber(n.toString(16), 16),
}

export const toNormalizedDenomination = {
	WEI: (bigNumber: BigNumber) => bigNumber.div(BIG_NUMBER_WEI_MULTIPLIER),
	GWEI: (bigNumber: BigNumber) => bigNumber.div(BIG_NUMBER_GWEI_MULTIPLIER),
	ETH: (bigNumber: BigNumber) => bigNumber.div(BIG_NUMBER_ETH_MULTIPLIER),
}

export const toSpecifiedDenomination = {
	WEI: (bigNumber: BigNumber) => bigNumber.times(BIG_NUMBER_WEI_MULTIPLIER).round(),
	GWEI: (bigNumber: BigNumber) => bigNumber.times(BIG_NUMBER_GWEI_MULTIPLIER).round(9),
	ETH: (bigNumber: BigNumber) => bigNumber.times(BIG_NUMBER_ETH_MULTIPLIER).round(9),
}

const baseChange = {
	hex: (n: any) => n.toString(16),
	dec: (n: any) => new BigNumber(n).toString(10),
	BN: (n: any) => new BN(n.toString(16)),
}

export interface ConversionUtilOptions {
	fromCurrency?: string
	toCurrency?: string
	fromNumericBase?: NumericBase
	toNumericBase?: NumericBase
	fromDenomination?: EthDenomination
	toDenomination?: EthDenomination
	numberOfDecimals?: number
	conversionRate?: number
	invertConversionRate?: boolean
	roundDown?: number
}

type valFromWei = {
	fromCurrency?: string | undefined
	toCurrency?: string
	conversionRate?: number
	numberOfDecimals?: number
	toDenomination?: EthDenomination
}

export function getValueFromEthDec(value: string, params: valFromWei) {
	return conversionUtil(value, {
		fromNumericBase: NumericBase.DEC,
		toNumericBase: NumericBase.DEC,
		fromCurrency: params.fromCurrency ?? "ETH",
		toCurrency: params.toCurrency,
		numberOfDecimals: params.numberOfDecimals,
		fromDenomination: EthDenomination.ETH,
		toDenomination: params.toDenomination,
		conversionRate: params.conversionRate,
	})
}

export function getValueFromGWeiDec(value: string, params: valFromWei) {
	return conversionUtil(value, {
		fromNumericBase: NumericBase.DEC,
		toNumericBase: NumericBase.DEC,
		fromCurrency: params.fromCurrency ?? "ETH",
		toCurrency: params.toCurrency,
		numberOfDecimals: params.numberOfDecimals,
		fromDenomination: EthDenomination.GWEI,
		toDenomination: params.toDenomination,
		conversionRate: params.conversionRate,
	})
}

export function getValueFromWeiHex(value: string, params: valFromWei) {
	return conversionUtil(value, {
		fromNumericBase: NumericBase.HEX,
		toNumericBase: NumericBase.DEC,
		fromCurrency: params.fromCurrency ?? "ETH",
		toCurrency: params.toCurrency,
		numberOfDecimals: params.numberOfDecimals,
		fromDenomination: EthDenomination.WEI,
		toDenomination: params.toDenomination,
		conversionRate: params.conversionRate,
	})
}

export function decimalToHex(decimal: string) {
	return conversionUtil(decimal, {
		fromNumericBase: NumericBase.DEC,
		toNumericBase: NumericBase.HEX,
	})
}

export function conversionUtil(value: string | BigNumber, config: ConversionUtilOptions): string | BigNumber {
	if (config.fromCurrency !== config.toCurrency && !config.conversionRate) {
		return new BigNumber(0)
	}
	return converter(
		value || "0",
		config.fromNumericBase,
		config.fromDenomination,
		config.fromCurrency,
		config.toNumericBase,
		config.toDenomination,
		config.toCurrency,
		config.numberOfDecimals,
		config.conversionRate,
		config.invertConversionRate,
		config.roundDown
	)
}

/**
 * Utility method to convert a value between denominations, formats and currencies.
 *
 * @param {string | BigNumber} value
 * @param {NumericBase} fromNumericBase
 * @param {EthDenomination} [fromDenomination]
 * @param {string} [fromCurrency]
 * @param {NumericBase} toNumericBase
 * @param {EthDenomination} [toDenomination]
 * @param {string} [toCurrency]
 * @param {number} [numberOfDecimals]
 * @param {number} [conversionRate]
 * @param {boolean} [invertConversionRate]
 * @param {string} [roundDown]
 */
export function converter(
	value: string | BigNumber,
	fromNumericBase?: NumericBase,
	fromDenomination?: EthDenomination,
	fromCurrency?: string,
	toNumericBase?: NumericBase,
	toDenomination?: EthDenomination,
	toCurrency?: string,
	numberOfDecimals?: number,
	conversionRate?: number,
	invertConversionRate?: boolean,
	roundDown?: number
): string | BigNumber {
	let convertedValue = fromNumericBase
		? toBigNumber[fromNumericBase](value)
		: value instanceof BigNumber
		? value
		: new BigNumber(value)

	if (fromDenomination) {
		convertedValue = toNormalizedDenomination[fromDenomination](convertedValue)
	}

	if (fromCurrency !== toCurrency) {
		if (conversionRate === null || conversionRate === undefined) {
			throw new Error(
				`Converting from ${fromCurrency} to ${toCurrency} requires a conversionRate, but one was not provided`
			)
		}
		const conversionRateBI = new BigNumber(conversionRate)
		let rate = toBigNumber.dec(conversionRateBI)
		if (invertConversionRate) {
			rate = new BigNumber(1.0).div(conversionRateBI)
		}
		convertedValue = convertedValue.times(rate)
	}

	if (toDenomination) {
		convertedValue = toSpecifiedDenomination[toDenomination](convertedValue)
	}

	if (numberOfDecimals !== undefined && numberOfDecimals !== null) {
		convertedValue = convertedValue.round(numberOfDecimals, BigNumber.ROUND_HALF_DOWN)
	}

	if (roundDown) {
		convertedValue = convertedValue.round(roundDown, BigNumber.ROUND_DOWN)
	}

	if (toNumericBase) {
		convertedValue = baseChange[toNumericBase](convertedValue)
	}
	return convertedValue
}

// Utility function for checking base types
export function isValidBase(base: number): boolean {
	return Number.isInteger(base) && base > 1
}

export function getBigNumber(value: string | BigNumber, base: number): BigNumber {
	if (!isValidBase(base)) {
		throw new Error("Must specify valid base")
	}

	return new BigNumber(String(value), base)
}
