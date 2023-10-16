import {
    LoggerFactory,
    WarpFactory,
    defaultCacheOptions,
    type CacheOptions,
    type LogLevel,
} from 'warp-contracts/mjs';
import { v4 as uuidv4 } from 'uuid';
import { getAddress } from './arweaveHelper';
import {
    getTitle,
    getDescription,
    getWallet,
    getWarpContractTxId,
    waitFor,
} from './common';
import type { Repo } from '../types';

const jwk = getWallet();
const contractTxId = getWarpContractTxId();

const getWarp = (cacheOptions?: CacheOptions, logLevel?: LogLevel) => {
    // set log level to fatal
    LoggerFactory.INST.logLevel(logLevel ? logLevel : 'fatal');
    const options = cacheOptions ? cacheOptions : defaultCacheOptions;
    return WarpFactory.forMainnet({ ...options });
};

const contract = getWarp({ ...defaultCacheOptions, inMemory: true })
    .contract(contractTxId)
    .connect(jwk);

export async function getRepo(id: string, cacheOptions?: CacheOptions) {
    const address = await getAddress();
    let pl = getWarp(cacheOptions).contract(contractTxId).connect(jwk);
    // let warp throw error if it can't retrieve the repository
    const response = await pl.viewState({
        function: 'getRepository',
        payload: {
            id,
        },
    });
    return response.result as Repo;
}

export async function getRepos() {
    const address = await getAddress();

    // let warp throw error if it can't retrieve the repositories
    const response = await contract.viewState({
        function: 'getRepositoriesByOwner',
        payload: {
            owner: address,
        },
    });
    return response.result as { id: string; name: string }[];
}

export async function postRepoToWarp(dataTxId: string, repo: Repo) {
    return updateRepo(repo, dataTxId);
}

// async function newRepo(dataTxId: string) {
//     if (!title || !dataTxId) throw '[ warp ] No title or dataTx for new repo';

//     // const contract = getWarp().contract(contractTxId).connect(jwk);

//     const uuid = uuidv4();

//     const payload = { id: uuid, name: title, description, dataTxId };

//     await waitFor(500);

//     // let warp throw error if it can't perform the writeInteraction
//     await contract.writeInteraction({
//         function: 'initialize',
//         payload,
//     });

//     console.log(`[ warp ] Repo '${title}' initialized with id '${uuid}'`);

//     return { id: uuid };
// }

async function updateRepo(repo: Repo, newDataTxId: string) {
    if (!repo.id || !repo.name || !newDataTxId)
        throw '[ warp ] No id, title or dataTxId to update repo ';

    // const contract = getWarp().contract(contractTxId).connect(jwk);
    const payload = {
        id: repo.id,
        name: repo.name,
        description: repo.description,
        dataTxId: newDataTxId,
    };

    await waitFor(500);

    // let warp throw error if it can't perform the writeInteraction
    await contract.writeInteraction({
        function: 'updateRepositoryTxId',
        payload,
    });

    // console.error(`[ warp ] Repo '${repo.name}' with id '${payload.id}' updated`);

    return { id: payload.id };
}
