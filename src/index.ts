#!/usr/bin/env node

import { gitdir } from './lib/common';
import { remoteHelper } from './lib/remoteHelper';

// parse command line arguments
const [remoteName, remoteUrl] = process.argv.slice(2, 4); // only use 2 parametes (remoteName and repo url)

if (!gitdir) throw new Error('Missing GIT_DIR env');

remoteHelper({
    remoteName: remoteName as string,
    remoteUrl: remoteUrl as string,
    gitdir,
}).then();
