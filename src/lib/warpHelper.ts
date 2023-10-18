import {
    LoggerFactory,
    WarpFactory,
    defaultCacheOptions,
    type LogLevel,
} from 'warp-contracts/mjs';
import { getWallet, getWarpContractTxId, log, waitFor } from './common';
import type { Repo } from '../types';
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
    // let warp throw error if it can't retrieve the repository
    const response = await pl.viewState({
        function: 'getRepository',
        payload: {
            id,
        },
    });
    return response.result as Repo;
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
