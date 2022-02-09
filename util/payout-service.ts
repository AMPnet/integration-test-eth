import axios from "axios";

const baseUrl = "http://localhost:8138"

export async function createPayout(
  token: string,
  chainId: number,
  assetAddress: string,
  payoutBlockNumber: number,
  ignoredAssetAddresses: string[]
): Promise<CreatePayoutResponse> {
    try {
        const { data } = await axios.post<CreatePayoutResponse>(`${baseUrl}/payout/${chainId}/${assetAddress}/create`, {
            payout_block_number: payoutBlockNumber,
            ignored_asset_addresses: ignoredAssetAddresses
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
        return data
    } catch (error) {
        console.log("createPayout error: ", error)
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
    total_asset_amount: string,
    ignored_asset_addresses: string[],
    payout_block_number: string,
    merkle_root_hash: string,
    merkle_tree_ipfs_hash: string,
    merkle_tree_depth: number
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
