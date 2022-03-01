import axios from "axios";

const baseUrl = "http://localhost:8138"

export async function createPayout(
  token: string,
  chainId: number,
  assetAddress: string,
  payoutBlockNumber: number,
  ignoredAssetAddresses: string[],
  issuerAddress?: string
): Promise<CreatePayoutResponse> {
    try {
        const { data } = await axios.post<CreatePayoutResponse>(
            `${baseUrl}/payouts/${chainId}/${assetAddress}/create`,
            {
                payout_block_number: payoutBlockNumber,
                ignored_asset_addresses: ignoredAssetAddresses,
                issuer_address: issuerAddress
            },
            {
                headers: {
                  Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("createPayout error: ", error)
    }
}

export async function getPayoutTaskById(
  token: string,
  chainId: number,
  taskId: string
): Promise<PayoutResponse> {
    try {
        const { data } = await axios.get<PayoutResponse>(
            `${baseUrl}/payouts/${chainId}/task/${taskId}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("getPayoutTaskById error: ", error)
    }
}

export async function getPayouts(
  token: string,
  chainId: number,
  assetFactories: string[],
  payoutService: string,
  payoutManager: string,
  issuer?: string,
  owner?: string,
  status?: PayoutStatus[]
): Promise<AdminPayoutsResponse> {
    try {
        const { data } = await axios.get<AdminPayoutsResponse>(
            `${baseUrl}/payouts/${chainId}`,
            {
                params: {
                    assetFactories: assetFactories.join(","),
                    payoutService: payoutService,
                    payoutManager: payoutManager,
                    issuer: issuer,
                    owner: owner,
                    status: status?.join(",")
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("getPayouts error: ", error)
    }
}

export async function getPayoutsForInvestor(
  token: string,
  chainId: number,
  investorAddress: string,
  assetFactories: string[],
  payoutService: string,
  payoutManager: string,
  issuer?: string
): Promise<InvestorPayoutsResponse> {
    try {
        const { data } = await axios.get<InvestorPayoutsResponse>(
            `${baseUrl}/payouts/${chainId}/investor/${investorAddress}`,
            {
                params: {
                    assetFactories: assetFactories.join(","),
                    payoutService: payoutService,
                    payoutManager: payoutManager,
                    issuer: issuer
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("getPayoutsForInvestor error: ", error)
    }
}

export async function getPayoutTree(
  chainId: number,
  assetAddress: string,
  rootHash: string
): Promise<FetchMerkleTreeResponse> {
    try {
        const { data } = await axios.get<FetchMerkleTreeResponse>(
            `${baseUrl}/payout_info/${chainId}/${assetAddress}/tree/${rootHash}`
        )
        return data
    } catch (error) {
        console.log("getPayoutTree error: ", error)
    }
}

export async function getPayoutPath(
  chainId: number,
  assetAddress: string,
  rootHash: string,
  walletAddress: string,
  expectError: boolean = false
): Promise<FetchMerkleTreePathResponse | ErrorResponse> {
    try {
        const { data } = await axios.get<FetchMerkleTreePathResponse>(
            `${baseUrl}/payout_info/${chainId}/${assetAddress}/tree/${rootHash}/path/${walletAddress}`
        )
        return data
    } catch (error) {
        if (!expectError) {
            console.log("getPayoutPath error: ", error)
        }
        return error.response.data
    }
}

export interface ErrorResponse {
    description: string,
    err_code: string,
    message: string
}

export interface CreatePayoutResponse {
    task_id: string
}

export type PayoutStatus = "PROOF_PENDING" | "PROOF_FAILED" | "PROOF_CREATED" | "PAYOUT_CREATED"

export interface PayoutResponse {
    taskId?: string,
    status: PayoutStatus,
    issuer?: string,

    payout_id?: string,
    payout_owner: string,
    payout_info?: string,
    is_canceled?: boolean,

    asset: string,
    total_asset_amount?: number,
    ignored_asset_addresses: string[],

    asset_snapshot_merkle_root?: string,
    asset_snapshot_merkle_depth?: number,
    asset_snapshot_block_number: string,
    asset_snapshot_merkle_ipfs_hash: string,

    reward_asset?: string,
    total_reward_amount?: string,
    remaining_reward_amount?: string
}

export interface AdminPayoutsResponse {
    payouts: PayoutResponse[]
}

export interface InvestorPayoutResponse {
    payout: PayoutResponse,
    investor: string,
    amount_claimed: string,

    amount_claimable?: string,
    balance?: string,
    proof?: string[]
}

export interface InvestorPayoutsResponse {
    payouts: InvestorPayoutResponse[]
}

export type Node = NilNode | LeafNode | PathNode

export interface NilNode {
    hash: string
}

export interface LeafNode {
    hash: string,
    data: {
        address: string,
        balance: string
    }
}

export interface PathNode {
    hash: string,
    left: Node,
    right: Node
}

export interface MerkleTree {
    depth: number,
    hash: string,
    hash_fn: string,
    left: Node,
    right: Node
}

export interface FetchMerkleTreeResponse {
    merkle_tree: MerkleTree
}

export interface PathSegment {
    sibling_hash: string,
    is_left: boolean
}

export interface FetchMerkleTreePathResponse {
    wallet_address: string,
    wallet_balance: string,
    path: PathSegment[],
    proof: string[]
}
