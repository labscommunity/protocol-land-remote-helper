import { walletJWK } from '../wallet';
import { getRepo, postRepoToWarp } from './warpHelper';
import { spawn } from 'child_process';
import { arweaveDownload, uploadRepo } from './arweaveHelper';
import { unpackGitRepo, zipRepoJsZip } from './zipHelper';
import type { Repo } from '../types';
import path from 'path';
import { defaultCacheOptions } from 'warp-contracts/mjs';
import { existsSync } from 'fs';
import { PL_TMP_PATH, getTags } from './common';

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
        // find repo in PL warp contract
        repo = await getRepo(repoId, {
            ...defaultCacheOptions,
            dbLocation: path.join(destPath, defaultCacheOptions.dbLocation),
        });
        // console.error(` > Repo's dataTxId: ${repo.dataTxId}`);
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

    const latestVersionRepoPath = path.join(destPath, repo.dataTxId);
    // if `repo.dataTxId` folder exsits, do nothing, repo is already cached
    if (existsSync(latestVersionRepoPath)) {
        console.error(`Using cached repo in '${latestVersionRepoPath}'`);
        return repo;
    }

    // if not, download repo data from arweave
    console.error(
        `Repo cache not found, downloading from arweave with txId '${repo.dataTxId}'`
    );
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
        const dowloadedRepoPath = path.join(destPath, repo.name);
        const bareRepoPath = path.join(destPath, repo.dataTxId);
        // clone it as a bare repo
        const cloned = await runCommand(
            'git',
            ['clone', '--bare', dowloadedRepoPath, bareRepoPath],
            { forwardStdOut: true }
        );
        if (!cloned) {
            console.error('Failed to prepare bare remote from dowloaded repo');
            process.exit(1);
        }

        // delete the downloaded PL repo
        await runCommand('rm', ['-rf', '', dowloadedRepoPath], {
            forwardStdOut: true,
        });
        // return the name of the folder where we cloned the bare repo

        return repo;
    }
};

export const uploadProtocolLandRepo = async (repoPath: string, repo: Repo) => {
    const wallet = getWallet();
    console.error('Packing repo');
    const buffer = await zipRepoJsZip(repo.name, repoPath, '', true, [
        PL_TMP_PATH,
    ]);
    const dataTxId = await uploadRepo(
        buffer,
        await getTags(repo.name, repo.description)
    );
    const updated = await postRepoToWarp(dataTxId, repo);
    return updated.id === repo.id;
};

/** @notice spawns a command with args, optionally forwarding stdout to stderr */
const runCommand = async (
    command: string,
    args: string[],
    options?: { forwardStdOut: boolean }
) => {
    console.error(` > Running '${command} ${args.join(' ')}'`);
    const child = spawn(command, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    return await new Promise<boolean>((resolve, reject) => {
        child.on('error', reject);
        if (options?.forwardStdOut) {
            // forward stdout to stderr (to be shown in console)
            child.stdout.on('data', (data) => process.stderr.write);
        }
        child.on('close', (code) => {
            if (code === 0) {
                resolve(true);
            } else {
                reject(new Error(`Command exited with code ${code}`));
            }
        });
    });
};
