import {
    LoggerFactory,
    WarpFactory,
    defaultCacheOptions,
    type LogLevel,
} from 'warp-contracts/mjs';
import { getWallet, getWarpContractTxId, isValidUuid, waitFor } from './common';
import type { Repo, User } from '../types';
import path from 'path';

export const getWarpCacheOptions = (cachePath: string) => {
    return {
        ...defaultCacheOptions,
        dbLocation: path.join(cachePath, defaultCacheOptions.dbLocation),
    };
};

const getWarp = (destPath?: string, logLevel?: LogLevel) => {
    // set warp log level to none
    LoggerFactory.INST.logLevel(logLevel ? logLevel : 'none');
    const options = destPath
        ? getWarpCacheOptions(destPath)
        : { ...defaultCacheOptions, inMemory: true };
    return WarpFactory.forMainnet({ ...options });
};

export async function getRepo(id: string, destpath?: string) {
    let pl = getWarp(destpath).contract(getWarpContractTxId());
    if (isValidUuid(id)) {
        // let warp throw error if it can't retrieve the repository
        const response = await pl.viewState({
            function: 'getRepository',
            payload: {
                id,
            },
        });
        return response.result as Repo;
    } else {
        const [username, repoName] = id.split('/');
        if (!username || !repoName) return;

        const state = (await pl.readState()).cachedValue.state as {
            users: { [key: string]: User };
        };
        const userAddress = Object.entries(state.users).find(
            ([_, user]) => user.username === username
        )?.[0];
        if (!userAddress) return;

        const ownerReposResponse = await pl.viewState({
            function: 'getRepositoriesByOwner',
            payload: { owner: userAddress },
        });

        const repos = ownerReposResponse?.result as Repo[];
        const repo = repos.find((repo) => repo.name === repoName);
        return repo;
    }
}

export async function updateWarpRepo(
    repo: Repo,
    newDataTxId: string,
    destPath?: string
) {
    if (!repo.id || !repo.name || !newDataTxId)
        throw '[ warp ] No id, title or dataTxId to update repo ';

    const payload = {
        id: repo.id,
        name: repo.name,
        description: repo.description,
        dataTxId: newDataTxId,
    };

    await waitFor(500);

    // let warp throw error if it can't perform the writeInteraction
    const contract = getWarp().contract(getWarpContractTxId());
    await contract.connect(getWallet()).writeInteraction({
        function: 'updateRepositoryTxId',
        payload,
    });

    return { id: payload.id };
}
