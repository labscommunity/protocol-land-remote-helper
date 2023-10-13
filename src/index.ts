import { spawn } from "child_process";
import * as path from "path";
import { downloadProtocolLandRepo } from "./protocolLandSync";
import { walletJWK } from "./wallet";
import { remoteHelper } from "./remoteHelper";

// constants
const GIT_RECEIVE_PACK_MSG = "'git-receive-pack' command executed.";
const ENUMERATING_OBJECTS_MSG = "unpack ok";
const HELPER_COMMAND = "proland-helper"; // should be on the PATH like this scriptts

// environment variables
const tmpPath = process.env.REPO_TMP
  ? (process.env.REPO_TMP as string)
  : path.join(process.env.HOME as string, "coding", "grh", "remotes");
const wallet = process.env.WALLET ? JSON.parse(process.env.WALLET) : walletJWK;
if (!wallet) throw new Error("No Wallet provided");

// parse command line arguments
const [remoteName, remoteUrl] = process.argv.slice(2, 4); // only use 2 parametes (remote name and repo url)

// sync protocol land repo to tmp_path
// downloadProtocolLandRepo(wallet, path.join(tmp_path, remoteUrl as string));

remoteHelper({
  remoteName: remoteName as string,
  remoteUrl: remoteUrl as string,
  tmpPath,
});

// // flag to signal when pushing to a remote
// let gitReceivePackExecuted = false;
// let objectsUpdated = false;

// // call helper that manages comms with git
// const helperProcess = spawn(
//   "bash",
//   [HELPER_COMMAND, remoteName as string, remoteUrl as string, tmpPath],
//   {
//     stdio: ["pipe", "pipe", "pipe"], // Pipe for stdin, stdout, and stderr
//   }
// );

// // Pipe data: process.stdin -> helperProcess.stdin
// process.stdin.pipe(helperProcess.stdin);

// // Pipe data: helperProcess.stdout -> process.stdout
// helperProcess.stdout.pipe(process.stdout);
// // Pipe data: helperProcess.stderr -> process.stderr
// helperProcess.stderr.pipe(process.stderr);

// // intercept stdout to check if objects have been updated (avoid an empty push)
// helperProcess.stdout.on("data", (data) => {
//   if (data.toString().includes(ENUMERATING_OBJECTS_MSG)) objectsUpdated = true;
// });

// // Handle stderr data (used to show messages because stdin/stdout are for comms)
// // helperProcess.stderr.on("data", (data) => {
// //   const errorOutput = data.toString();
// //   process.stderr.write(errorOutput);
// //   if (errorOutput.includes(GIT_RECEIVE_PACK_MSG)) gitReceivePackExecuted = true;
// // });

// // Handle process exit
// helperProcess.on("exit", (code) => {
//   if (code === 0) {
//     if (gitReceivePackExecuted && objectsUpdated) {
//       console.error(
//         `Pushed to temp remote. Now syncing with Protocol Land ...`
//       );
//       // uploadProtocolLandRepo(wallet, args[-1]);
//     }
//   } else {
//     console.error(`Bash script exited with code ${code}.`);
//   }
// });
