import axios from "axios";

const baseUrl = "http://localhost:8139"

export async function createBalanceCheckRequest(request: CreateBalanceCheckRequest): Promise<BalanceCheckResponse> {
    try {
        const { data } = await axios.post<BalanceCheckResponse>(`${baseUrl}/balance`, request)
        return data
    } catch (error) {
        console.log("createBalanceCheckRequest error: ", error)
    }
}

export async function getBalanceCheckRequestById(id: string): Promise<BalanceCheckResponse> {
    try {
        const { data } = await axios.get<BalanceCheckResponse>(`${baseUrl}/balance/${id}`)
        return data
    } catch (error) {
        console.log("getBalanceCheckRequestById error: ", error)
    }
}

export async function attachWalletAddressAndSignedMessage(
  id: string,
  walletAddress: string,
  signedMessage: string
): Promise<any> {
    try {
        const { data } = await axios.put<any>(`${baseUrl}/balance/${id}`, {
            wallet_address: walletAddress,
            signed_message: signedMessage
        })
        return data
    } catch (error) {
        console.log("attachWalletAddressAndSignedMessage error: ", error)
    }
}

export interface CreateBalanceCheckRequest {
    client_id?: string
    chain_id?: number
    redirect_url?: string
    token_address?: string
    block_number?: string
    wallet_address?: string
    arbitrary_data?: any
    screen_config?: ScreenConfig
}

export interface BalanceCheckResponse {
    id: string
    status: RequestStatus
    chain_id: number
    redirect_url: string
    token_address: string
    block_number?: string
    wallet_address?: string
    arbitrary_data?: any
    screen_config?: ScreenConfig,
    balance?: {
        wallet: string
        block_number: string
        timestamp: string
        amount: string
    }
    message_to_sign: string
    signed_message?: string
}

export type RequestStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface ScreenConfig {
    title?: string
    message?: string
    logo?: string
}

export async function createSendRequest(request: CreateSendRequest): Promise<SendRequestResponse> {
    try {
        const { data } = await axios.post<SendRequestResponse>(`${baseUrl}/send`, request)
        return data
    } catch (error) {
        console.log("createSendRequest error: ", error)
    }
}

export async function getSendRequestById(id: string): Promise<SendRequestResponse> {
    try {
        const { data } = await axios.get<SendRequestResponse>(`${baseUrl}/send/${id}`)
        return data
    } catch (error) {
        console.log("getSendRequestById error: ", error)
    }
}

export async function attachTransactionHash(id: string, txHash: string): Promise<any> {
    try {
        const { data } = await axios.put<any>(`${baseUrl}/send/${id}`, {tx_hash: txHash})
        return data
    } catch (error) {
        console.log("attachTransactionHash error: ", error)
    }
}

export interface CreateSendRequest {
    client_id?: string
    chain_id?: number
    redirect_url?: string
    token_address?: string
    amount: string
    sender_address?: string
    recipient_address: string
    arbitrary_data?: any
    screen_config?: ScreenConfig
}

export interface SendRequestResponse {
    id: string
    status: RequestStatus
    chain_id: number
    token_address: string
    amount: string
    sender_address?: string
    recipient_address: string
    arbitrary_data?: any
    screen_config?: ScreenConfig
    redirect_url: string
    send_tx: {
        tx_hash?: string
        from?: string
        to: string
        data: string
        block_confirmations?: string
    }
}
