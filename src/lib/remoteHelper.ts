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
import { waitFor } from './common';

const OBJECTS_PUSHED = 'unpack ok';

export type RemoteHelperParams = {
    remoteName: string;
    remoteUrl: string;
    tmpRemotePath: string;
};

export const remoteHelper = async (params: RemoteHelperParams) => {
    const defaultTmpPath = process.env.HOME + '/tmp';
    const { remoteName, remoteUrl, tmpRemotePath } = params;

    // Check if the tmp folder exists, and create it if it doesn't
    if (!existsSync(tmpRemotePath)) {
        mkdirSync(tmpRemotePath, { recursive: true });
        if (!existsSync(tmpRemotePath)) {
            console.error(`Failed to create the directory: ${tmpRemotePath}`);
            process.exit(1);
        }
    }

    // Join tmpPath and the repo folder filtering the 'protocol://'
    //   const repoPath = `${tmpRemotePath}/${remoteUrl.replace(/.*:\/\//, "")}`;
    const repoId = `${remoteUrl.replace(/.*:\/\//, '')}`;

    // sync protocol land repo to tmp_path
    console.error(
        `Dowloading latest repo from Protocol.Land into tmp folder '${tmpRemotePath}' for remote syncing`
    );
    const repo = await downloadProtocolLandRepo(repoId, tmpRemotePath);

    const newTmpRemotePath = path.join(tmpRemotePath, repo.dataTxId);

    let pushed = 0;

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
                    spawnPipedGitCommand(arg as string, newTmpRemotePath, repo);
                    break;
            }
        }
    }

    readLinesUntilEmpty();
};

const spawnPipedGitCommand = (
    gitCommand: string,
    remoteUrl: string,

    repo: Repo
) => {
    // define flag to check if objects have been pushed
    let objectsUpdated = false;

    // call helper that manages comms with git
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

    // parse stdout to check if objects have been updated (avoid an empty push)
    gitProcess.stdout.on('data', (data) => {
        if (data.toString().includes(OBJECTS_PUSHED)) objectsUpdated = true;
    });

    // Handle process exit
    gitProcess.on('exit', async (code) => {
        if (code === 0) {
            // if pushed to tmp remote, upload tmp remote to protocol land
            if (gitCommand === 'git-receive-pack' && objectsUpdated) {
                waitFor(1000);
                console.error(
                    `Pushed to temp remote. Now syncing with Protocol Land ...`
                );
                const workingPath = path.join(remoteUrl, '..', '..', '..');
                console.error(` > Updating repo to warp from '${workingPath}'`);
                const success = await uploadProtocolLandRepo(workingPath, repo);
                if (success)
                    console.error(
                        `Successfully pushed repo '${repo.id}' to Protocol Land`
                    );
                else
                    console.error(
                        `Failed to push repo '${repo.id}' to Protocol Land`
                    );
            }
        } else {
            console.error(
                `git command '${gitCommand}' exited with code ${code}.`
            );
        }
    });
};
