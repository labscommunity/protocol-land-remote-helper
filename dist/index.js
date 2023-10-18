#!/usr/bin/env node

// src/lib/remoteHelper.ts
import { existsSync as existsSync2, mkdirSync } from "fs";
import { spawn as spawn2 } from "child_process";
import readline from "readline";
import { Writable } from "stream";

// src/lib/warpHelper.ts
import {
  LoggerFactory,
  WarpFactory,
  defaultCacheOptions
} from "warp-contracts/mjs";

// src/lib/arweaveHelper.ts
import Arweave from "arweave";
import { ArweaveSigner, createData } from "arbundles";

// src/lib/withAsync.ts
async function withAsync(fn) {
  try {
    if (typeof fn !== "function")
      throw new Error("The first argument must be a function");
    const response = await fn();
    return {
      response,
      error: null
    };
  } catch (error) {
    return {
      error,
      response: null
    };
  }
}

// src/lib/arweaveHelper.ts
async function getAddress() {
  return await initArweave().wallets.jwkToAddress(getWallet());
}
async function uploadRepo(zipBuffer, tags) {
  try {
    const bundlrTxId = await bundlrUpload(zipBuffer, tags);
    log(`Posted Tx to Bundlr: ${bundlrTxId}`);
    return bundlrTxId;
  } catch (error) {
    log("Bundlr failed, trying with Arweave...");
    const arweaveTxId = await arweaveUpload(zipBuffer, tags);
    log(`Posted Tx to Arweave: ${arweaveTxId}`);
    return arweaveTxId;
  }
}
function initArweave() {
  return Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https"
  });
}
async function arweaveDownload(txId) {
  const { response, error } = await withAsync(
    () => fetch(`https://arweave.net/${txId}`)
  );
  if (error) {
    throw new Error(error);
  } else if (response) {
    return await response.arrayBuffer();
  }
}
async function arweaveUpload(zipBuffer, tags) {
  const jwk = getWallet();
  if (!jwk)
    throw "[ arweave ] No jwk wallet supplied";
  const arweave = initArweave();
  const dataSize = zipBuffer.length;
  const tx = await arweave.createTransaction({ data: zipBuffer }, jwk);
  for (const tag of tags)
    tx.addTag(tag.name, tag.value);
  await arweave.transactions.sign(tx, jwk);
  const response = await arweave.transactions.post(tx);
  log(`${response.status} - ${response.statusText}`);
  if (response.status !== 200) {
    throw `[ arweave ] Posting repo to arweave failed.
	Error: '${response.status}' - '${response.statusText}'
	Check if you have plenty $AR to upload ~${Math.ceil(
      dataSize / 1024
    )} KB of data.`;
  }
  return tx.id;
}
async function bundlrUpload(zipBuffer, tags) {
  const jwk = getWallet();
  if (!jwk)
    throw "[ bundlr ] No jwk wallet supplied";
  const node = "https://node2.bundlr.network";
  const uint8ArrayZip = new Uint8Array(zipBuffer);
  const signer = new ArweaveSigner(jwk);
  const dataItem = createData(uint8ArrayZip, signer, { tags });
  await dataItem.sign(signer);
  const res = await fetch(`${node}/tx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream"
    },
    body: dataItem.getRaw()
  });
  if (res.status >= 400)
    throw new Error(
      `[ bundlr ] Posting repo w/bundlr failed. Error: ${res.status} - ${res.statusText}`
    );
  return dataItem.id;
}

// src/lib/common.ts
import { execSync } from "child_process";
import { readFileSync } from "fs";
var ANSI_RESET = "\x1B[0m";
var ANSI_RED = "\x1B[31m";
var ANSI_GREEN = "\x1B[32m";
var PL_TMP_PATH = ".protocol.land";
var GIT_CONFIG_KEYFILE = "protocol.land.keyfile";
var getWarpContractTxId = () => "w5ZU15Y2cLzZlu3jewauIlnzbKw-OAxbN9G5TbuuiDQ";
var log = (message, options) => {
  if (!options)
    console.error(` [PL] ${message}`);
  else {
    const { color } = options;
    console.error(
      `${color === "red" ? ANSI_RED : ANSI_GREEN} [PL] ${message}${ANSI_RESET}`
    );
  }
};
var wallet = null;
var getJwkPath = () => {
  try {
    return execSync(`git config --get ${GIT_CONFIG_KEYFILE}`).toString().trim();
  } catch (error) {
    return "";
  }
};
var getWallet = () => {
  if (wallet)
    return wallet;
  const jwkPath = getJwkPath();
  if (!jwkPath)
    walletNotFoundMessage();
  try {
    const jwk = readFileSync(jwkPath, { encoding: "utf-8" }).toString().trim();
    if (!jwk)
      walletNotFoundMessage();
    return JSON.parse(jwk);
  } catch (error) {
    walletNotFoundMessage();
  }
};
var walletNotFoundMessage = (params = { warn: false }) => {
  const { warn } = params;
  if (warn) {
    log(
      `If you need to push to the repo, please set up the path to your Arweave JWK.`,
      { color: "green" }
    );
  } else {
    log(`Failed to get wallet keyfile path from git config.`);
    log(
      `You need an owner or contributor wallet to have write access to the repo.`,
      { color: "red" }
    );
  }
  log(
    `Run 'git config --add ${GIT_CONFIG_KEYFILE} YOUR_WALLET_KEYFILE_FULL_PATH' to set it up`,
    { color: "green" }
  );
  log(
    `Use '--global' to have a default keyfile for all Protocol Land repos`,
    { color: "green" }
  );
  return null;
};
async function getTags(title, description) {
  return [
    { name: "App-Name", value: "Protocol.Land" },
    { name: "Content-Type", value: "application/zip" },
    { name: "Creator", value: await getAddress() },
    { name: "Title", value: title },
    { name: "Description", value: description },
    { name: "Type", value: "repo-update" }
  ];
}
var waitFor = (delay) => new Promise((res) => setTimeout(res, delay));

// src/lib/warpHelper.ts
import path from "path";
var getWarpCacheOptions = (cachePath) => {
  return {
    ...defaultCacheOptions,
    dbLocation: path.join(cachePath, defaultCacheOptions.dbLocation)
  };
};
var getWarp = (destPath, logLevel) => {
  LoggerFactory.INST.logLevel(logLevel ? logLevel : "none");
  const options = destPath ? getWarpCacheOptions(destPath) : { ...defaultCacheOptions, inMemory: true };
  return WarpFactory.forMainnet({ ...options });
};
async function getRepo(id, destpath) {
  let pl = getWarp(destpath).contract(getWarpContractTxId());
  const response = await pl.viewState({
    function: "getRepository",
    payload: {
      id
    }
  });
  return response.result;
}
async function updateWarpRepo(repo, newDataTxId, destPath) {
  if (!repo.id || !repo.name || !newDataTxId)
    throw "[ warp ] No id, title or dataTxId to update repo ";
  const payload = {
    id: repo.id,
    name: repo.name,
    description: repo.description,
    dataTxId: newDataTxId
  };
  await waitFor(500);
  const contract = getWarp().contract(getWarpContractTxId());
  await contract.connect(getWallet()).writeInteraction({
    function: "updateRepositoryTxId",
    payload
  });
  return { id: payload.id };
}

// src/lib/protocolLandSync.ts
import { execSync as execSync2, spawn } from "child_process";

// src/lib/zipHelper.ts
import fs from "fs";
import path2 from "path";
import JSZip from "jszip";
function loadIgnoreList(rootPath) {
  const gitignorePath = path2.join(rootPath, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    return gitignoreContent.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
  }
  return [];
}
async function unpackGitRepo({
  destPath,
  arrayBuffer
}) {
  const zip = await JSZip.loadAsync(arrayBuffer);
  zip.forEach(async (_, file) => {
    if (file.dir) {
      const folderPath = path2.join(destPath, file.name);
      fs.mkdirSync(folderPath, { recursive: true });
    } else {
      const filePath = path2.join(destPath, file.name);
      const content = await file.async("blob");
      fs.writeFileSync(
        filePath,
        new Uint8Array(await content.arrayBuffer())
      );
    }
  });
  await waitFor(1e3);
  return true;
}
async function zipRepoJsZip(mainPath, zipRoot, folderToZip, useGitignore, ignoreFiles) {
  if (!folderToZip)
    folderToZip = zipRoot;
  const ignoreList = useGitignore ? loadIgnoreList(zipRoot) : [];
  const ignoreFilesList = ignoreFiles ? ignoreFiles.map((f) => path2.join(zipRoot, f)) : [];
  const ignoreSet = /* @__PURE__ */ new Set([...ignoreList, ...ignoreFilesList]);
  const zip = new JSZip();
  const filesToInclude = [];
  const walk = (currentPath) => {
    const items = fs.readdirSync(currentPath);
    for (const item of items) {
      const itemPath = path2.join(currentPath, item);
      if (ignoreSet.has(item)) {
        continue;
      }
      if (fs.statSync(itemPath).isDirectory()) {
        walk(itemPath);
      } else {
        filesToInclude.push(itemPath);
      }
    }
  };
  walk(folderToZip);
  for (const file of filesToInclude) {
    const content = fs.readFileSync(file);
    const relativePath = path2.join(
      mainPath ? mainPath + "/" : "",
      path2.relative(zipRoot, file)
    );
    zip.file(relativePath, content);
  }
  return await zip.generateAsync({ type: "nodebuffer" });
}

// src/lib/protocolLandSync.ts
import path3 from "path";
import "warp-contracts/mjs";
import { existsSync } from "fs";
var downloadProtocolLandRepo = async (repoId, destPath) => {
  log(`Getting latest repo from Protocol.Land into '${destPath}' ...`);
  let repo;
  try {
    repo = await getRepo(repoId, destPath);
  } catch (err) {
    log(err);
  }
  if (!repo) {
    log(`Repo '${repoId}' not found`, { color: "red" });
    log(`Please create a repo in https://protocol.land first`, {
      color: "green"
    });
    process.exit(0);
  }
  const latestVersionRepoPath = path3.join(destPath, repo.dataTxId);
  if (existsSync(latestVersionRepoPath)) {
    log(`Using cached repo in '${latestVersionRepoPath}'`);
    return repo;
  }
  log(`Downloading from arweave with txId '${repo.dataTxId}' ...`);
  const arrayBuffer = await arweaveDownload(repo.dataTxId);
  if (!arrayBuffer) {
    log("Failed to fetch repo data from arweave.", { color: "red" });
    log("Check connection or repo integrity in https://protocol.land", {
      color: "green"
    });
    process.exit(0);
  }
  log(`Unpacking downloaded repo ...`);
  const status = await unpackGitRepo({
    destPath,
    arrayBuffer
  });
  if (!status) {
    log("Unpacking failed!", { color: "red" });
    log("Check repo integrity in https://protocol.land", {
      color: "green"
    });
    process.exit(0);
  }
  const unpackedRepoPath = path3.join(destPath, repo.name);
  const bareRepoPath = path3.join(destPath, repo.dataTxId);
  const cloned = await runCommand(
    "git",
    ["clone", "--bare", unpackedRepoPath, bareRepoPath],
    { forwardStdOut: true }
  );
  if (!cloned) {
    log("Failed to prepare bare remote from unpacked repo!", {
      color: "red"
    });
    log("Check repo integrity in https://protocol.land", {
      color: "green"
    });
    process.exit(0);
  }
  try {
    execSync2(
      `find ${destPath} -mindepth 1 -maxdepth 1 -type d ! -name "cache" ! -name "${repo.dataTxId}" -exec rm -rf {} \\;`
    );
  } catch {
  }
  return repo;
};
var uploadProtocolLandRepo = async (repoPath, repo, destPath) => {
  log("Packing repo ...");
  const buffer = await zipRepoJsZip(repo.name, repoPath, "", true, [
    PL_TMP_PATH
  ]);
  log("Uploading to Arweave ...");
  let dataTxId;
  try {
    dataTxId = await uploadRepo(
      buffer,
      await getTags(repo.name, repo.description)
    );
  } catch (error) {
    log(error);
  }
  if (!dataTxId)
    return false;
  log("Updating in warp ...");
  const updated = await updateWarpRepo(repo, dataTxId, destPath);
  return updated.id === repo.id;
};
var runCommand = async (command, args, options) => {
  log(`Running '${command} ${args.join(" ")}' ...`);
  const child = spawn(command, args, {
    shell: true,
    stdio: ["pipe", "pipe", "pipe"]
  });
  return await new Promise((resolve, reject) => {
    child.on("error", reject);
    if (options?.forwardStdOut) {
      child.stdout.on("data", (data) => log);
    }
    child.on("close", (code) => {
      if (code === 0) {
        resolve(true);
      } else {
        log(`Command Failed. Exit code: ${code}`);
        resolve(false);
      }
    });
  });
};

// src/lib/remoteHelper.ts
import path4 from "path";
var OBJECTS_PUSHED = "unpack ok";
var remoteHelper = async (params) => {
  const { remoteUrl: remoteUrl2, gitdir: gitdir2 } = params;
  const tmpPath = getTmpPath(gitdir2);
  const repoId = `${remoteUrl2.replace(/.*:\/\//, "")}`;
  const repo = await downloadProtocolLandRepo(repoId, tmpPath);
  const bareRemotePath = path4.join(tmpPath, repo.dataTxId);
  talkToGit(bareRemotePath, repo, tmpPath);
};
function getTmpPath(gitdir2) {
  const tmpPath = path4.join(gitdir2, PL_TMP_PATH);
  if (!existsSync2(tmpPath)) {
    mkdirSync(tmpPath, { recursive: true });
    if (!existsSync2(tmpPath))
      throw new Error(`Failed to create the directory: ${tmpPath}`);
  }
  return tmpPath;
}
function talkToGit(bareRemotePath, repo, tmpPath) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: new Writable({
      write(chunk, encoding, callback) {
        callback();
      }
    })
    // Passing a null stream for output
  });
  async function readLinesUntilEmpty() {
    const promptForLine = () => new Promise((resolve) => rl.question("", resolve));
    while (true) {
      const line = (await promptForLine()).trim();
      if (line === "") {
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
          spawnPipedGitCommand(
            arg,
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
var spawnPipedGitCommand = (gitCommand, remoteUrl2, repo, tmpPath) => {
  if (gitCommand === "git-receive-pack" && !getWallet())
    process.exit(0);
  if (!getJwkPath())
    walletNotFoundMessage({ warn: true });
  let objectsUpdated = false;
  const gitProcess = spawn2(gitCommand, [remoteUrl2], {
    stdio: ["pipe", "pipe", "pipe"]
    // Pipe for stdin, stdout, and stderr
  });
  process.stdin.pipe(gitProcess.stdin);
  gitProcess.stdout.pipe(process.stdout);
  gitProcess.stderr.pipe(process.stderr);
  gitProcess.stdout.on("data", (data) => {
    if (data.toString().includes(OBJECTS_PUSHED))
      objectsUpdated = true;
  });
  gitProcess.on("exit", async (code) => {
    if (code !== 0) {
      log(
        `git command '${gitCommand}' exited with error. Exit code: ${code}`,
        {
          color: "red"
        }
      );
      process.exit(code ? code : 1);
    }
    if (gitCommand === "git-receive-pack" && objectsUpdated) {
      log(
        `Push to temp remote finished successfully, now syncing with Protocol Land ...`
      );
      const pathToPack = path4.join(remoteUrl2, "..", "..", "..");
      waitFor(1e3);
      const success = await uploadProtocolLandRepo(
        pathToPack,
        repo,
        tmpPath
      );
      if (success)
        log(`Successfully pushed repo '${repo.id}' to Protocol Land`, {
          color: "green"
        });
      else
        log(`Failed to push repo '${repo.id}' to Protocol Land`, {
          color: "red"
        });
    }
  });
};

// src/index.ts
var [remoteName, remoteUrl] = process.argv.slice(2, 4);
var gitdir = process.env.GIT_DIR;
if (!gitdir)
  throw new Error("Missing GIT_DIR env");
remoteHelper({
  remoteName,
  remoteUrl,
  gitdir
}).then();
