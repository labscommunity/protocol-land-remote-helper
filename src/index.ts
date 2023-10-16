#!/usr/bin/env node

import * as path from 'path';
import { remoteHelper } from './lib/remoteHelper';
import { PL_TMP_PATH } from './lib/common';

// parse command line arguments
const [remoteName, remoteUrl] = process.argv.slice(2, 4); // only use 2 parametes (remote name and repo url)

// get gitdir (usually '.git')
const gitdir = process.env.GIT_DIR as string;
if (!gitdir) throw new Error('Missing GIT_DIR env');

// define a tmp path to download repo from protocol land and use as (tmp) remote
const tmpRemotePath = path.join(gitdir, PL_TMP_PATH);

remoteHelper({
    remoteName: remoteName as string,
    remoteUrl: remoteUrl as string,
    tmpRemotePath,
}).then();
