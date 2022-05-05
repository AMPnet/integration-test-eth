import axios from "axios";

const baseUrl = "http://localhost:8139"

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

export type SendRequestStatus = 'PENDING' | 'SUCCESS' | 'FAILED'

export interface CreateSendRequest {
    client_id?: string
    chain_id?: number
    redirect_url?: string
    token_address?: string
    amount: string
    sender_address?: string
    recipient_address: string
    arbitrary_data?: any
    screen_config?: SendScreenConfig
}

export interface SendRequestResponse {
    id: string
    status: SendRequestStatus
    chain_id: number
    token_address: string
    amount: string
    sender_address?: string
    recipient_address: string
    arbitrary_data?: any
    screen_config?: SendScreenConfig
    redirect_url: string
    send_tx: {
        tx_hash?: string
        from?: string
        to: string
        data: string
        block_confirmations?: string
    }
}

export interface SendScreenConfig {
    title?: string
    message?: string
    logo?: string
}
