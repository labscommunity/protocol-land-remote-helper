import redstone from 'redstone-api';
import { initArweave } from './common';

interface CoinGeckoPriceResult {
    arweave: {
        [key: string]: number;
    };
    [key: string]: {
        [key: string]: number;
    };
}

export async function getArPrice() {
    try {
        const data = (await (
            await fetch(
                `https://api.coingecko.com/api/v3/simple/price?ids=arweave&vs_currencies=usd`
            )
        ).json()) as CoinGeckoPriceResult;

        return data.arweave.usd as number;
    } catch (e) {
        const response = await redstone.getPrice('AR');

        if (!response.value) {
            return 0;
        }

        return (response.source as any).coingecko as number;
    }
}

export async function getWinstonPriceForBytes(bytes: number) {
    try {
        const response = await fetch(`https://arweave.net/price/${bytes}`);
        const winston = await response.text();

        return +winston;
    } catch (error: any) {
        throw new Error(error);
    }
}

export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export async function calculateEstimate(bytes: number) {
    const formattedSize = formatBytes(bytes);

    const costInWinston = await getWinstonPriceForBytes(bytes);
    const costInAR = +initArweave().ar.winstonToAr(costInWinston.toString());

    const costFor1ARInUSD = await getArPrice();
    const costInUSD = costInAR * costFor1ARInUSD;

    return {
        formattedSize,
        costInAR: costInAR.toPrecision(5),
        costInUSD: costInUSD.toPrecision(5),
    };
}
