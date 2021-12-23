export enum AssetState {
    CREATION = 0,
    TOKENIZED = 1
}

export interface DockerEnv {
    WALLET_APPROVER_ADDRESS: string
    FAUCET_SERVICE_ADDRESS: string
    AUTO_INVEST_SERVICE_ADDRESS: string
    CF_MANAGER_FACTORY_ADDRESS_0: string
    SNAPSHOT_DISTRIBUTOR_ADDRESS_0: string
}
