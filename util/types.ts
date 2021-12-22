export enum AssetState {
    CREATION = 0,
    TOKENIZED = 1
}

export interface DockerEnv { // TODO add more variables
    WALLET_APPROVER_PRIVATE_KEY: string
    WALLET_APPROVER_ADDRESS: string
    CF_MANAGER_FACTORY_ADDRESS_0: string
    SNAPSHOT_DISTRIBUTOR_ADDRESS_0: string
}
