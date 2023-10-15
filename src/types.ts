export type Repo = {
    id: string;
    name: string;
    description: string;
    dataTxId: string;
    owner: string;
    contributors: string[];
};

export type Tag = {
    name: string;
    value: string;
};
