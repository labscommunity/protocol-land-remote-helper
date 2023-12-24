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
};

export type Tag = {
    name: string;
    value: string;
};
