import { walletJWK } from '../wallet';
import { getRepo } from './warpHelper';
import { spawn } from 'child_process';
import { arweaveDownload } from './arweaveHelper';
import { unpackGitRepo } from './zipHelper';
import type { Repo } from '../types';

const getWallet = () => {
    const wallet = process.env.WALLET
        ? JSON.parse(process.env.WALLET)
        : walletJWK;
    if (!wallet) throw new Error('No Wallet provided');
    console.error(` > Wallet size: ${wallet.length}`);
};

export const downloadProtocolLandRepo = async (
    repoId: string,
    destPath: string
) => {
    // const wallet = getWallet();
    let repo: Repo;
    try {
        repo = await getRepo(repoId);
        console.error(` > Repo's dataTxId: ${repo.dataTxId}`);
    } catch (error) {
        const { message } = error as { message: string };
        if (message === 'Repository not found.') {
            console.error(
                `Remote repo '${repoId}' not found, please create a repo in https://protocol.land first`
            );
            // git init empty repo
            // await runCommand('git', ['init', destPath]);
        } else {
            console.error(error);
        }
        // stop process
        process.exit(1);
    }
    // download repo data from arweave
    const arrayBuffer = await arweaveDownload(repo.dataTxId);
    if (!arrayBuffer) {
        console.error('Failed to fetch repo data from arweave');
        process.exit(1);
    }
    // console.error(` > Zipped Repo's size: ${zippedRepo.byteLength} bytes`);
    // unzip repo into destPath
    const status = await unpackGitRepo({
        destPath,
        arrayBuffer,
    });

    if (!status) {
        console.error('Failed to unpack repo');
        process.exit(1);
    } else {
        console.error('Downloaded repo unpacked successfully');
        return repo.name;
    }
};

export const uploadProtocolLandRepo = async (destPath: string) => {
    const wallet = getWallet();
};

// spawns a command with args, forwarding stdout to stderr
const runCommand = async (command: string, args: string[]) => {
    const child = spawn(command, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    await new Promise<void>((resolve, reject) => {
        child.on('error', reject);
        // forward stdout to stderr (to be shown in console)
        child.stdout.on('data', (data) => process.stderr.write);
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command exited with code ${code}`));
            }
        });
    });
};
