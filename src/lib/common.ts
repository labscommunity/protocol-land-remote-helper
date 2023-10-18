import { getAddress } from './arweaveHelper';
import type { Tag } from '../types';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import type { JsonWebKey } from 'crypto';

const ANSI_RESET = '\x1b[0m';
const ANSI_RED = '\x1b[31m';
const ANSI_GREEN = '\x1b[32m';
export const PL_TMP_PATH = '.protocol.land';
export const GIT_CONFIG_KEYFILE = 'protocol.land.keyfile';
export const getWarpContractTxId = () =>
    'w5ZU15Y2cLzZlu3jewauIlnzbKw-OAxbN9G5TbuuiDQ';

export const log = (message: any, options?: { color: 'red' | 'green' }) => {
    if (!options) console.error(` [PL] ${message}`);
    else {
        const { color } = options;
        console.error(
            `${
                color === 'red' ? ANSI_RED : ANSI_GREEN
            } [PL] ${message}${ANSI_RESET}`
        );
    }
};

let wallet: JsonWebKey | null = null;

export const getJwkPath = () =>
    execSync(`git config --get ${GIT_CONFIG_KEYFILE}`).toString().trim();

export const getWallet = () => {
    if (wallet) return wallet;
    try {
        const jwkPath = getJwkPath();
        if (!jwkPath) walletNotFoundMessage();

        const jwk = readFileSync(jwkPath, { encoding: 'utf-8' })
            .toString()
            .trim();
        if (!jwk) walletNotFoundMessage();
        return JSON.parse(jwk);
    } catch (error) {
        walletNotFoundMessage();
    }
};

export const walletNotFoundMessage = (
    params: { warn: boolean } = { warn: false }
) => {
    const { warn } = params;
    if (warn) {
        log(
            `If you need to push to the repo, please set up the path to your Arweave JWK.`,
            { color: 'green' }
        );
    } else {
        log(`Failed to get wallet keyfile path from git config.`);
        log(
            `You need an owner or contributor wallet to have write access to the repo.`,
            { color: 'red' }
        );
    }
    log(
        `Run 'git config --add ${GIT_CONFIG_KEYFILE} YOUR_WALLET_KEYFILE_FULL_PATH' to set it up`,
        { color: 'green' }
    );
    log(
        `Use '--global' to use have a default keyfile for all protocol land repos`,
        { color: 'green' }
    );
    return null;
};

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
    log(``);
    log(`${message}`);
    log(``);
    process.exit(1);
};
