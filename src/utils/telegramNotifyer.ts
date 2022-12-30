export async function notifyTelegram(message: string) {
	console.log(message)
	const valid = process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID
	if (!valid) {
		console.log("notifyTelegram: invalid config")
		return
	}
	try {
		const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/sendMessage`, {
			method: "POST",
			body: JSON.stringify({
				chat_id: process.env.TELEGRAM_CHAT_ID,
				text: message,
			}),
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
		})
		return (await response.json()).ok
	} catch (error) {
		console.error(`error while send message: ${error}`)
	}
}
