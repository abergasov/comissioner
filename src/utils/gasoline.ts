import BigNumber from "bignumber.js"
import {
	conversionUtil,
	getBigNumber,
	getValueFromEthDec,
	getValueFromGWeiDec,
	isValidBase,
	NumericBase,
} from "./convert"
import { ethers } from "ethers"

const USD_CURRENCY_CODE = "usd"

export function calculateEtherCost(etherAmount: string | ethers.BigNumber, ethPrice: number): string | BigNumber {
	return getValueFromEthDec(etherAmount.toString(), {
		toCurrency: USD_CURRENCY_CODE,
		conversionRate: ethPrice,
		numberOfDecimals: 2,
	})
}

export function calculateGasCost(gasAmount: string | ethers.BigNumber, ethPrice: number): string | BigNumber {
	return getValueFromGWeiDec(gasAmount.toString(), {
		toCurrency: USD_CURRENCY_CODE,
		conversionRate: ethPrice,
		numberOfDecimals: 2,
	})
}

export function calcGasTotal(gasLimit: string | BigNumber = "0", gasPrice: string | BigNumber = "0") {
	return multiplyCurrencies(gasLimit, gasPrice, NumericBase.HEX, 16, 16)
}

const multiplyCurrencies = (
	a: string | BigNumber,
	b: string | BigNumber,
	toNumericBase: NumericBase,
	multiplicandBase: number,
	multiplierBase: number
) => {
	if (!isValidBase(multiplicandBase) || !isValidBase(multiplierBase)) {
		throw new Error("Must specify valid multiplicandBase and multiplierBase")
	}

	const value = getBigNumber(a, multiplicandBase).times(getBigNumber(b, multiplierBase))

	return conversionUtil(value, {
		toNumericBase: toNumericBase,
	})
}
