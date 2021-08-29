import axios, {AxiosResponse} from "axios";
const baseUrl = "http://localhost:8137"

export async function getXlsxReport(token: string, issuer: string, chainId: number): Promise<AxiosResponse|null> {
    try {
        return await axios.get(`${baseUrl}/admin/${chainId}/${issuer}/report/xlsx`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
    } catch (error) {
        console.log("getXlsxReport error: ", error)
        return null
    }
}

export async function getTxHistory(token: string, issuer: string, chainId: number): Promise<AxiosResponse|null> {
    try {
        return await axios.get(`${baseUrl}/tx_history/${chainId}/${issuer}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        })
    } catch (error) {
        console.log("getXlsxReport error: ", error)
        return null
    }
}
