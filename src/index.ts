#!/usr/bin/env node

import { remoteHelper } from './lib/remoteHelper';

// parse command line arguments
const [remoteName, remoteUrl] = process.argv.slice(2, 4); // only use 2 parametes (remoteName and repo url)

// get gitdir (usually '.git')
const gitdir = process.env.GIT_DIR as string;
if (!gitdir) throw new Error('Missing GIT_DIR env');

remoteHelper({
    remoteName: remoteName as string,
    remoteUrl: remoteUrl as string,
    gitdir,
}).then();
