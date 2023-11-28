import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import readline from 'readline';
import { Writable } from 'stream';
import {
    downloadProtocolLandRepo,
    uploadProtocolLandRepo,
} from './protocolLandSync';
import path from 'path';
import type { Repo } from '../types';
import {
    PL_TMP_PATH,
    clearCache,
    getWallet,
    log,
    ownerOrContributor,
    setCacheDirty,
    unsetCacheDirty,
    waitFor,
} from './common';
import {
    trackRepositoryCloneEvent,
    trackRepositoryUpdateEvent,
} from './analytics';

// string to check if objects were pushed
const OBJECTS_PUSHED = 'unpack ok';

export type RemoteHelperParams = {
    remoteName: string;
    remoteUrl: string;
    gitdir: string;
};

export const remoteHelper = async (params: RemoteHelperParams) => {
    const { remoteUrl, gitdir } = params;

    // get tmp path for remote (throws if can't create a tmp path)
    const tmpPath = getTmpPath(gitdir);

    // get repoId from remoteUrl (remove the `protocol.land://` from it)
    const repoId = `${remoteUrl.replace(/.*:\/\//, '')}`;

    // download protocol land repo latest version to tmpRemotePath
    const repo = await downloadProtocolLandRepo(repoId, tmpPath);

    // construct bare repo path
    const bareRemotePath = path.join(tmpPath, repo.dataTxId);

    // start communication with git
    talkToGit(bareRemotePath, repo, tmpPath);
};

function getTmpPath(gitdir: string) {
    const tmpPath = path.join(gitdir, PL_TMP_PATH);

    // Check if the tmp folder exists, and create it if it doesn't
    if (!existsSync(tmpPath)) {
        mkdirSync(tmpPath, { recursive: true });
        if (!existsSync(tmpPath))
            throw new Error(`Failed to create the directory: ${tmpPath}`);
    }
    return tmpPath;
}

function talkToGit(bareRemotePath: string, repo: Repo, tmpPath: string) {
    // create a readline interface to read lines
    const rl = readline.createInterface({
        input: process.stdin,
        output: new Writable({
            write(chunk, encoding, callback) {
                callback();
            },
        }), // Passing a null stream for output
    });

    // Main communication loop
    async function readLinesUntilEmpty() {
        const promptForLine = () =>
            new Promise<string>((resolve) => rl.question('', resolve));

        while (true) {
            const line = (await promptForLine()).trim();

            // if empty line -> Exit
            if (line === '') {
                rl.close();
                process.exit(0);
            }

            const [command, arg] = line.split(' ');

            switch (command) {
                case 'capabilities':
                    console.log('connect');
                    console.log('');
                    break;

                case 'connect':
                    console.log('');
                    // spawn git utility 'arg' with the remoteUrl as an argument
                    await spawnPipedGitCommand(
                        arg as string,
                        bareRemotePath,
                        repo,
                        tmpPath
                    );
                    break;
            }
        }
    }

    readLinesUntilEmpty();
}

const spawnPipedGitCommand = async (
    gitCommand: string,
    remoteUrl: string,
    repo: Repo,
    tmpPath: string
) => {
    let wallet: any;
    // if pushing
    if (gitCommand === 'git-receive-pack') {
        wallet = getWallet({ warn: false });

        // if missing wallet, exit without running gitCommand (getWallet prints a message)
        if (!wallet) process.exit(0);

        const ownerOrContrib = await ownerOrContributor(repo, wallet, {
            pushing: true,
        });

        // if not owner or contriburtor, exit without running gitCommand (ownerOrContributor prints a message)
        if (!ownerOrContrib) process.exit(0);
    } else {
        // not pushing

        // getWallet warns if wallet is not found
        wallet = getWallet({ warn: true });

        if (wallet) {
            // has a wallet defined, but
            // warn user if not owner or contributor (fn already prints a message)
            ownerOrContributor(repo, wallet);
        }
    }

    // define flag to check if objects have been pushed
    let objectsUpdated = false;

    // define isCloningRepo flag to check if its clone command
    // tmpPath split is greater than 2 while cloning as in other cases its usually `.git/.protocol.land`
    const isCloningRepo =
        gitCommand === 'git-upload-pack' && tmpPath.split(path.sep).length > 2;

    // spawn the gitCommand and pipe all stdio
    const gitProcess = spawn(gitCommand, [remoteUrl as string], {
        stdio: ['pipe', 'pipe', 'pipe'], // Pipe for stdin, stdout, and stderr
    });

    // Pipe Data:
    //   stdin: process -> gitProcess
    //   stdout: gitProcess -> process
    //   stderr: gitProcess -> process
    process.stdin.pipe(gitProcess.stdin);
    gitProcess.stdout.pipe(process.stdout);
    gitProcess.stderr.pipe(process.stderr);

    // parse stdout to check if objects have been updated (avoid uploading after an empty push)
    gitProcess.stdout.on('data', (data) => {
        if (data.toString().includes(OBJECTS_PUSHED)) objectsUpdated = true;
    });

    // Handle process exit
    gitProcess.on('exit', async (code) => {
        // if error, show message and exit
        if (code !== 0) {
            log(
                `git command '${gitCommand}' exited with error. Exit code: ${code}`,
                {
                    color: 'red',
                }
            );
            process.exit(code ? code : 1);
        }

        // if pushed to tmp bare remote ok AND objects were updated, then upload repo to protocol land
        if (gitCommand === 'git-receive-pack' && objectsUpdated) {
            log(
                `Push to temp remote finished successfully, now syncing with Protocol Land ...`
            );

            // mark cache as inconsistent
            setCacheDirty(tmpPath, repo.dataTxId);

            const pathToPack = path.join(remoteUrl, '..', '..', '..');

            waitFor(1000);

            const success = await uploadProtocolLandRepo(
                pathToPack,
                repo,
                tmpPath
            );

            // We clear the cached remote:
            //   If upload succeeded, there's a new txId for the repo
            //   If upload failed, the cached remote has an inconsistent state
            clearCache(tmpPath, { keepFolders: ['cache'] });

            // remove inconsistent cache mark
            unsetCacheDirty(tmpPath, repo.dataTxId);

            if (success) {
                log(`Successfully pushed repo '${repo.id}' to Protocol Land`, {
                    color: 'green',
                });
                await trackRepositoryUpdateEvent(wallet, {
                    repo_name: repo.name,
                    repo_id: repo.id,
                    result: 'SUCCESS',
                });
            } else {
                log(`Failed to push repo '${repo.id}' to Protocol Land`, {
                    color: 'red',
                });
                log(
                    'Please run `git pull` first to clean the cache and integrate your changes',
                    {
                        color: 'red',
                    }
                );
                await trackRepositoryUpdateEvent(wallet, {
                    repo_name: repo.name,
                    repo_id: repo.id,
                    result: 'FAILED',
                    error: 'Failed to update repository',
                });
                process.exit(1);
            }
        } else if (isCloningRepo) {
            await trackRepositoryCloneEvent(wallet, {
                repo_name: repo.name,
                repo_id: repo.id,
                result: 'SUCCESS',
            });
        }
    });
};
