import { getRepo, updateRepo } from './aoHelper';
import { spawn } from 'child_process';
import { arweaveDownload, uploadRepo } from './arweaveHelper';
import { unpackGitRepo, zipRepoJsZip } from './zipHelper';
import type { Repo } from '../types';
import path from 'path';
import { existsSync, promises as fsPromises } from 'fs';
import {
    PL_TMP_PATH,
    clearCache,
    getTags,
    gitdir,
    isCacheDirty,
    log,
} from './common';
import { decryptRepo } from './privateRepo';
import { calculateEstimate } from './prices';

export const downloadProtocolLandRepo = async (
    repoId: string,
    destPath: string
) => {
    log(`Getting latest repo from Protocol.Land into '${destPath}' ...`);

    // find repo in Protocol Land's AO contract
    let repo: Repo | undefined;
    try {
        repo = await getRepo(repoId);
    } catch (err) {
        log(err);
    }

    // if repo not found, exit gracefully
    if (!repo) {
        log(`Repo '${repoId}' not found`, { color: 'red' });
        log(`Please create a repo in https://protocol.land first`, {
            color: 'green',
        });
        process.exit(0);
    }

    // use tmp folder named as repo's latest dataTxId
    const latestVersionRepoPath = path.join(destPath, repo.dataTxId);

    // if folder exists, there is a cached remote
    if (existsSync(latestVersionRepoPath)) {
        // check if cache is dirty
        if (!isCacheDirty(destPath, repo.dataTxId)) {
            // cache is clean, use it
            log(`Using cached repo in '${latestVersionRepoPath}'`);
            return repo;
        }

        // cache is dirty, clear cache and continue
        clearCache(destPath, { keepFolders: [] });
    }

    // if not, download repo data from arweave
    log(`Downloading from arweave with txId '${repo.dataTxId}' ...`);
    let arrayBuffer = await arweaveDownload(repo.dataTxId);
    if (!arrayBuffer) {
        log('Failed to fetch repo data from arweave.', { color: 'red' });
        log('Check connection or repo integrity in https://protocol.land', {
            color: 'green',
        });
        process.exit(0);
    }

    const isPrivate = repo?.private || false;
    const privateStateTxId = repo?.privateStateTxId;

    if (isPrivate && privateStateTxId) {
        arrayBuffer = await decryptRepo(arrayBuffer, privateStateTxId);
    }

    // unzip repo into destPath
    log(`Unpacking downloaded repo ...`);
    const status = await unpackGitRepo({
        destPath,
        arrayBuffer,
    });

    if (!status) {
        log('Unpacking failed!', { color: 'red' });
        log('Check repo integrity in https://protocol.land', {
            color: 'green',
        });
        process.exit(0);
    }

    // unpacked into `repo.id` folder, clone a bare repo from it
    const unpackedRepoPath = path.join(destPath, repo.id);
    const bareRepoPath = path.join(destPath, repo.dataTxId);

    // Rename parent id to repo id on cloning when fork has not been updated yet
    if (repo.fork && repo.parent) {
        const unpackedPath = path.join(destPath, repo.parent);
        if (existsSync(unpackedPath)) {
            await fsPromises.rename(unpackedPath, unpackedRepoPath);
        }
    }

    // clone it as a bare repo
    const cloned = await runCommand(
        'git',
        ['clone', '--bare', unpackedRepoPath, bareRepoPath],
        { forwardStdOut: true }
    );

    if (!cloned) {
        log('Failed to prepare bare remote from unpacked repo!', {
            color: 'red',
        });
        log('Check repo integrity in https://protocol.land', {
            color: 'green',
        });
        process.exit(0);
    }

    // rm -rf everything but the bare repo and AO cache (discard stdout)
    try {
        clearCache(destPath, { keepFolders: [repo.dataTxId] });
    } catch {}

    return repo;
};

export const uploadProtocolLandRepo = async (
    repoPath: string,
    repo: Repo,
    destPath: string
) => {
    let dataTxId: string | undefined;
    let pushCancelled = false;
    try {
        // pack repo
        log('Packing repo ...\n');
        let buffer = await zipRepoJsZip(repo.id, repoPath, '', [
            path.join(gitdir, PL_TMP_PATH),
        ]);

        const isPrivate = repo?.private || false;
        const privateStateTxId = repo?.privateStateTxId;

        if (isPrivate && privateStateTxId) {
            throw new Error('Private repos are no longer supported.');
        }

        const bufferSize = Buffer.byteLength(buffer);
        const {
            costInAR,
            costInARWithPrecision,
            costInUSDWithPrecision,
            formattedSize,
        } = await calculateEstimate(bufferSize);

        const spaces = ' '.repeat(6);
        log(
            `Cost Estimates for push:\n${spaces}Size: ${formattedSize}\n${spaces}Cost: ~${costInARWithPrecision} AR (~${costInUSDWithPrecision} USD)\n`,
            { color: 'green' }
        );

        // upload to turbo/arweave
        log('Uploading to Arweave ...');
        ({ txId: dataTxId, pushCancelled } = await uploadRepo(
            buffer,
            await getTags(repo.name, repo.description),
            bufferSize,
            costInAR
        ));
    } catch (error: any) {
        log(error?.message || error, { color: 'red' });
        pushCancelled = false;
    }
    if (!dataTxId) return { success: false, pushCancelled };

    // update repo info in AO
    log('Updating in AO ...');
    const updated = await updateRepo(repo, dataTxId);

    // check for AO update success
    return { success: updated.id === repo.id, pushCancelled };
};

/** @notice spawns a command with args, optionally forwarding stdout to stderr */
const runCommand = async (
    command: string,
    args: string[],
    options?: { forwardStdOut: boolean }
) => {
    log(`Running '${command} ${args.join(' ')}' ...`);
    const child = spawn(command, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe'],
    });
    return await new Promise<boolean>((resolve, reject) => {
        child.on('error', reject);
        if (options?.forwardStdOut) {
            // forward stdout to stderr (to be shown in console)
            child.stdout.on('data', (data) => log);
        }
        child.on('close', (code) => {
            if (code === 0) {
                resolve(true);
            } else {
                log(`Command Failed. Exit code: ${code}`);
                resolve(false);
            }
        });
    });
};
