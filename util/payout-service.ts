import axios from "axios";

const baseUrl = "http://localhost:8138"

export async function createSnapshot(
  token: string,
  name: string,
  chainId: number,
  assetAddress: string,
  payoutBlockNumber: number,
  ignoredAssetAddresses: string[]
): Promise<CreateSnapshotResponse> {
    try {
        const { data } = await axios.post<CreateSnapshotResponse>(
            `${baseUrl}/snapshots`,
            {
                name: name,
                chain_id: chainId,
                asset_address: assetAddress,
                payout_block_number: payoutBlockNumber,
                ignored_holder_addresses: ignoredAssetAddresses
            },
            {
                headers: {
                  Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("createSnapshot error: ", error)
    }
}

export async function getSnapshotById(
  token: string,
  id: string
): Promise<SnapshotResponse> {
    try {
        const { data } = await axios.get<SnapshotResponse>(
            `${baseUrl}/snapshots/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("getSnapshotById error: ", error)
    }
}

export async function getSnapshots(
  token: string,
  chainId?: number,
  status?: SnapshotStatus[]
): Promise<SnapshotsResponse> {
    try {
        const { data } = await axios.get<SnapshotsResponse>(
            `${baseUrl}/snapshots`,
            {
                params: {
                    chainId: chainId,
                    status: status?.join(",")
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        )
        return data
    } catch (error) {
        console.log("getSnapshots error: ", error)
    }
}

export async function getPayoutsForInvestor(
  token: string,
  chainId: number,
  assetFactories: string[],
  payoutService: string,
  payoutManager: string,
  issuer?: string
): Promise<InvestorPayoutsResponse> {
    try {
        const { data } = await axios.get<InvestorPayoutsResponse>(
            `${baseUrl}/claimable_payouts`,
            {
                params: {
                    chainId: chainId,
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

export interface CreateSnapshotResponse {
    id: string
}

export type SnapshotStatus = "PENDING" | "SUCCESS" | "FAILED"

export interface SnapshotResponse {
    id: string,
    name: string,
    chain_id: number,
    status: SnapshotStatus
    owner: string,
    asset: string,
    total_asset_amount?: number,
    ignored_holder_addresses: string[],
    asset_snapshot_merkle_root?: string,
    asset_snapshot_merkle_depth?: number,
    asset_snapshot_block_number: string,
    asset_snapshot_merkle_ipfs_hash: string
}

export interface SnapshotsResponse {
    snapshots: SnapshotResponse[]
}

export interface PayoutResponse {
    payout_id: string,
    payout_owner: string,
    payout_info: string,
    is_canceled: boolean,

    asset: string,
    total_asset_amount: string,
    ignored_holder_addresses: string[],

    asset_snapshot_merkle_root: string,
    asset_snapshot_merkle_depth: number,
    asset_snapshot_block_number: string,
    asset_snapshot_merkle_ipfs_hash: string,

    reward_asset: string,
    total_reward_amount: string,
    remaining_reward_amount: string
}

export interface InvestorPayoutResponse {
    payout: PayoutResponse,
    investor: string,
    amount_claimed: string,
    amount_claimable: string,
    balance: string,
    proof: string[]
}

export interface InvestorPayoutsResponse {
    claimable_payouts: InvestorPayoutResponse[]
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
