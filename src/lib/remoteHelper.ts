import { existsSync, mkdirSync } from 'fs';
import { spawn } from 'child_process';
import readline from 'readline';
import { Writable } from 'stream';
import { downloadProtocolLandRepo } from './protocolLandSync';

const OBJECTS_PUSHED = 'unpack ok';

export type RemoteHelperParams = {
    remoteName: string;
    remoteUrl: string;
    tmpRemotePath: string;
};

export const remoteHelper = (params: RemoteHelperParams) => {
    const defaultTmpPath = process.env.HOME + '/tmp';
    const { remoteName, remoteUrl, tmpRemotePath = defaultTmpPath } = params;

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

    console.error(`Using temp folder '${tmpRemotePath}' for remote syncing`);

    // sync protocol land repo to tmp_path
    downloadProtocolLandRepo(repoId, tmpRemotePath);

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
            new Promise<string>((resolve) => {
                rl.question('Enter a line (or press Enter to exit): ', resolve);
            });

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
                    spawnPipedGitCommand(arg as string, tmpRemotePath);
                    break;
            }
        }
    }

    readLinesUntilEmpty();
};

const spawnPipedGitCommand = (gitCommand: string, remoteUrl: string) => {
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
    gitProcess.on('exit', (code) => {
        if (code === 0) {
            // if pushed to tmp remote, upload tmp remote to protocol land
            if (gitCommand === 'git-receive-pack' && objectsUpdated) {
                console.error(
                    `Pushed to temp remote. Now syncing with Protocol Land ...`
                );
                // uploadProtocolLandRepo(args[-1]);
            }
        } else {
            console.error(
                `git command '${gitCommand}' exited with code ${code}.`
            );
        }
    });
};
