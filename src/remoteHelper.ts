import { existsSync, mkdirSync } from "fs";
import { spawn } from "child_process";
import readline from "readline";
import { Writable } from "stream";

const OBJECTS_PUSHED = "unpack ok";

export type RemoteHelperParams = {
  remoteName: string;
  remoteUrl: string;
  tmpPath: string;
};

export const remoteHelper = (params: RemoteHelperParams) => {
  const defaultTmpPath = process.env.HOME + "/tmp";
  const { remoteName, remoteUrl, tmpPath = defaultTmpPath } = params;

  //   console.error(`Running remote helper for '${remoteName} ${remoteUrl}'`);
  //   console.error(`Remote url: ${remoteUrl}`);

  // Check if the tmp folder exists, and create it if it doesn't
  if (!existsSync(tmpPath)) {
    mkdirSync(tmpPath, { recursive: true });
    if (!existsSync(tmpPath)) {
      console.error(`Failed to create the directory: ${tmpPath}`);
      process.exit(1);
    }
  }
  //   console.error(`Using tmp folder: ${tmpPath}`);

  // Join tmpPath and the repo folder filtering the 'protocol://'
  const repoPath = `${tmpPath}/${remoteUrl.replace(/.*:\/\//, "")}`;

  console.error(`Using temp folder '${repoPath}' for remote syncing`);

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
    // read one line
    const promptForLine = () =>
      new Promise<string>((resolve) => {
        rl.question("Enter a line (or press Enter to exit): ", resolve);
      });

    while (true) {
      const line = (await promptForLine()).trim();

      if (line === "") {
        // Empty line -> Exit
        rl.close();
        process.exit(0);
      }

      const [command, arg] = line.split(" ");

      switch (command) {
        case "capabilities":
          console.log("connect");
          console.log("");
          break;

        case "connect":
          console.log("");
          spawnPipedGitCommand(arg as string, repoPath);
          break;
      }
    }
    // rl.close();
  }

  readLinesUntilEmpty();

  //   process.stdin.on("data", (data) => {
  //     const lines = data.toString().split("\n");
  //     for (const line of lines) {
  //       const [command, arg] = line.trim().split(" ");

  //       //   console.error(`Handling input command ${command} with argument ${arg}`);

  //       switch (command) {
  //         case "capabilities":
  //           console.log("connect");
  //           console.log("");
  //           break;

  //         case "connect":
  //           console.log("");
  //           //   console.error(
  //           //     `Running helper utility ${arg} on repository ${repoPath}`
  //           //   );

  //           spawnPipedGitCommand(arg as string, repoPath);

  //           break;
  //       }
  //     }
  //   });

  //   process.stdin.on("end", () => {
  //     // console.error("Input command line is empty. Communication done");
  //     process.exit(0);
  //   });
};

const spawnPipedGitCommand = (gitCommand: string, remoteUrl: string) => {
  // define flag to check if objects have been pushed
  let objectsUpdated = false;

  // call helper that manages comms with git
  const gitProcess = spawn(gitCommand, [remoteUrl as string], {
    stdio: ["pipe", "pipe", "pipe"], // Pipe for stdin, stdout, and stderr
  });

  // Pipe Data:
  //   stdin: process -> gitProcess
  //   stdout: gitProcess -> process
  //   stderr: gitProcess -> process
  process.stdin.pipe(gitProcess.stdin);
  gitProcess.stdout.pipe(process.stdout);
  gitProcess.stderr.pipe(process.stderr);

  // parse stdout to check if objects have been updated (avoid an empty push)
  gitProcess.stdout.on("data", (data) => {
    if (data.toString().includes(OBJECTS_PUSHED)) objectsUpdated = true;
  });

  // Handle process exit
  gitProcess.on("exit", (code) => {
    if (code === 0) {
      if (gitCommand === "git-receive-pack" && objectsUpdated) {
        console.error(
          `Pushed to temp remote. Now syncing with Protocol Land ...`
        );
        // uploadProtocolLandRepo(wallet, args[-1]);
      }
    } else {
      console.error(`git command '${gitCommand}' exited with code ${code}.`);
    }
  });
};
