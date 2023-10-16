import { getAddress } from './arweaveHelper';
import { walletJWK } from '../wallet';
import type { Tag } from '../types';

const DESCRIPTION_PLACEHOLDER = 'Descentralized repo description';
export const PL_TMP_PATH = '.protocol.land';

export const getWallet = () =>
    JSON.parse(process.env.WALLET ? (process.env.WALLET as string) : walletJWK);

export const getWarpContractTxId = () =>
    'w5ZU15Y2cLzZlu3jewauIlnzbKw-OAxbN9G5TbuuiDQ';

export const getTitle = () =>
    process.env.REPO_TITLE
        ? (process.env.REPO_TITLE as string)
        : (process.cwd().split('/')[-1] as string);

export const getDescription = () =>
    process.env.REPO_DESCRIPTION
        ? (process.env.REPO_DESCRIPTION as string)
        : DESCRIPTION_PLACEHOLDER;

export async function getTags(title: string, description: string) {
    return [
        { name: 'App-Name', value: 'Protocol.Land' },
        { name: 'Content-Type', value: 'application/zip' },
        { name: 'Creator', value: await getAddress() },
        { name: 'Title', value: title },
        { name: 'Description', value: description },
        { name: 'Type', value: 'repo-update' },
    ] as Tag[];
}

export const waitFor = (delay: number) =>
    new Promise((res) => setTimeout(res, delay));

export const exitWithError = (message: string) => {
    console.error(`\n${message}\n`);
    process.exit(1);
};
