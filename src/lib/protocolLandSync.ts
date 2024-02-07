import { getRepo, updateWarpRepo } from './warpHelper';
import { spawn } from 'child_process';
import { arweaveDownload, uploadRepo } from './arweaveHelper';
import { unpackGitRepo, zipRepoJsZip } from './zipHelper';
import readline from 'node:readline';
import type { Repo } from '../types';
import path from 'path';
import fs, { existsSync, promises as fsPromises } from 'fs';
import {
    PL_TMP_PATH,
    clearCache,
    getTags,
    gitdir,
    isCacheDirty,
    log,
} from './common';
import { decryptRepo, encryptRepo } from './privateRepo';
import { calculateEstimate } from './prices';

async function checkAccessToTty() {
    try {
        await fsPromises.access(
            '/dev/tty',
            fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK
        );
        return true;
    } catch (err) {
        return false;
    }
}

function createTtyReadlineInterface() {
    const ttyReadStream = fs.createReadStream('/dev/tty');
    const ttyWriteStream = fs.createWriteStream('/dev/tty');

    const rl = readline.createInterface({
        input: ttyReadStream,
        output: ttyWriteStream,
    });

    return {
        rl,
        ttyReadStream,
        ttyWriteStream,
    };
}

function askQuestionThroughTty(question: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const { rl, ttyReadStream, ttyWriteStream } =
            createTtyReadlineInterface();

        rl.question(question, (answer: string) => {
            rl.close();
            ttyReadStream.destroy();
            ttyWriteStream.end();
            ttyWriteStream.on('finish', () => {
                resolve(answer.trim().toLowerCase());
            });
        });

        rl.on('error', (err) => reject(err));
        ttyReadStream.on('error', (err) => reject(err));
        ttyWriteStream.on('error', (err) => reject(err));
    });
}

export const downloadProtocolLandRepo = async (
    repoId: string,
    destPath: string
) => {
    log(`Getting latest repo from Protocol.Land into '${destPath}' ...`);

    // find repo in Protocol Land's warp contract
    let repo: Repo | undefined;
    try {
        repo = await getRepo(repoId, destPath);
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
        clearCache(destPath, { keepFolders: ['cache'] });
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

    // rm -rf everything but the bare repo and warp cache (discard stdout)
    try {
        clearCache(destPath, { keepFolders: ['cache', repo.dataTxId] });
    } catch {}

    return repo;
};

export const uploadProtocolLandRepo = async (
    repoPath: string,
    repo: Repo,
    destPath: string
) => {
    let dataTxId: string | undefined;
    try {
        // pack repo
        log('Packing repo ...\n');
        let buffer = await zipRepoJsZip(repo.id, repoPath, '', [
            path.join(gitdir, PL_TMP_PATH),
        ]);

        const isPrivate = repo?.private || false;
        const privateStateTxId = repo?.privateStateTxId;

        if (isPrivate && privateStateTxId) {
            buffer = await encryptRepo(buffer, privateStateTxId);
        }

        const bufferSize = Buffer.byteLength(buffer);
        const { costInAR, costInUSD, formattedSize } = await calculateEstimate(
            bufferSize
        );

        const spaces = ' '.repeat(6);
        log(
            `Cost Estimates for push:\n${spaces}Size: ${formattedSize}\n${spaces}Cost: ~${costInAR} AR (~${costInUSD} USD)\n`,
            { color: 'green' }
        );

        let hasAccessToTty = await checkAccessToTty();
        let answer = 'n';

        if (hasAccessToTty) {
            try {
                answer = await askQuestionThroughTty(' [PL] Push? (y/n): ');
            } catch (err) {
                hasAccessToTty = false;
            }
        }

        if (answer === 'yes' || answer === 'y' || !hasAccessToTty) {
            // upload to turbo/arweave
            log('Uploading to Arweave ...');
            dataTxId = await uploadRepo(
                buffer,
                await getTags(repo.name, repo.description)
            );
        }
    } catch (error: any) {
        log(error?.message || error, { color: 'red' });
    }
    if (!dataTxId) return false;

    // update repo info in warp
    log('Updating in warp ...');
    const updated = await updateWarpRepo(repo, dataTxId, destPath);

    // check for warp update success
    return updated.id === repo.id;
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
