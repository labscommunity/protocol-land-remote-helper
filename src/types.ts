export type User = {
    fullname?: string;
    username?: string;
    isUserNameArNS?: boolean;
    avatar?: string;
    bio?: string;
    location?: string;
    twitter?: string;
    email?: string;
    website?: string;
    readmeTxId?: string;
};

export type Repo = {
    id: string;
    name: string;
    description: string;
    dataTxId: string;
    owner: string;
    contributors: string[];
    fork: boolean;
    parent: string | null;
    private: boolean;
    privateStateTxId?: string;
    githubSync: GithubSync | null;
};

export interface GithubSync {
    enabled: boolean;
    repository: string;
    branch: string;
    workflowId: string;
    accessToken: string;
    privateStateTxId: string;
    allowed: Array<string>;
    pending: Array<string>;
}

export type PrivateState = {
    iv: string;
    encKeys: Record<string, string>;
    version: string;
    pubKeys: string[];
};

export type Tag = {
    name: string;
    value: string;
};

export type SubsidizedUploadJsonResponse = {
    success: boolean;
    bundled: boolean;
    data: { repoTxId: string };
    error?: string;
};

export type SendMessageArgs = {
    data?: string;
    tags: {
        name: string;
        value: string;
    }[];
    anchor?: string;
};
