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
