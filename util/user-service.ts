import axios from "axios";
const baseUrl = "http://localhost:8136"

export async function getPayload(address: string): Promise<string> {
    try {
        const { data } = await axios.post<PayloadResponse>(`${baseUrl}/authorize`, {
            address: address
        })
        return data.payload
    } catch (error) {
        console.log("getPayload error: ", error)
        return ""
    }
}

export async function getAccessToken(address: string, signedPayload: string): Promise<string> {
    try {
        const { data } = await axios.post<AuthJWTResponse>(`${baseUrl}/authorize/jwt`, {
            address: address,
            signed_payload: signedPayload
        })
        return data.access_token
    } catch (error) {
        console.log("getAccessToken error: ", error)
        return ""
    }
}

export async function completeKyc(token: string, address: string) {
    try {
        await axios.post(`${baseUrl}/test/kyc`, {
            address: address,
            first_name: "first",
            last_name: "last"
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
    } catch (error) {
        console.log("completeKyc error: ", error)
    }
}

export async function whitelistAddress(token: string, issuer: string, chainId: number) {
    try {
        await axios.post(`${baseUrl}/user/whitelist`, {
            issuer_address: issuer,
            chain_id: chainId
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
    } catch (error) {
        console.log("completeKyc error: ", error)
    }

}

export async function requestFaucetFunds(address: string, chainId: number) {
    try {
        console.log(`Requesting faucet funds for address: ${address}, chainId: ${chainId}`)
        await axios.post(`${baseUrl}/faucet/${chainId}/${address}`, {})
    } catch (error) {
        console.log("requestFaucetFunds error: ", error)
    }
}

export async function autoInvest(token: string, campaign: string, amount: string, chainId: number) {
    try {
        axios.post(`${baseUrl}/auto_invest/${chainId}/${campaign}`, {
            amount: amount
        }, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
    } catch (error) {
        console.log("autoInvest error: ", error)
    }
}

interface PayloadResponse {
    payload: string
}


interface AuthJWTResponse {
    access_token: string;
    expires_in: number; // millis
    refresh_token: string;
    refresh_token_expires_in: number; // millis
}
