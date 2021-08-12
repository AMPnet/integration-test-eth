import * as path from "path";
import * as compose from "docker-compose";
// @ts-ignore
import * as hc from "@danielwpz/health-check/index";
// @ts-ignore
import * as checker from "@danielwpz/health-check/lib/checker";
// const Healthcheck = require('@danielwpz/health-check');
// const HTTPChecker = HTTPChecker;

const dockerComposeLocation = path.join(__dirname, '..');

const intervalBetweenChecks = 6000 // 6 seconds between every new healthcheck
const maxNumberOfChecks = 30       // maximum of 30 checks after giving up which makes total of 3 minutes waiting time at the worst case

const sleep = (time: number) => new Promise(resolve => setTimeout(resolve, time))

export async function up() {
    await compose.upAll({
        cwd: dockerComposeLocation,
        log: true
    }).catch((err: any) => {
        console.log("docker-compose up error: ", err)
    })
    await healthCheck()
}

export async function showLogs(services: any) {
    let logs = await compose.logs(services)
    console.log("logs result", logs)
}

export async function down() {
    await compose.down({
        cwd: dockerComposeLocation,
        log: true
    }).catch((err: any) => {
        console.log("docker-compose down error: ", err)
    })
}

// TODO: fix this function
export async function healthCheck() {
    const identityServiceChecker = new checker.HTTPChecker('Identity Service checker', 'http://localhost:8136/actuator/health')
    const reportServiceChecker = new checker.HTTPChecker('Report Service checker', 'http://localhost:8137/actuator/health')
    const healthCheck = new hc.Healthcheck([
        identityServiceChecker,
        reportServiceChecker,
    ])
    let numberOfChecks = 0
    let status: any
    do {
        if (numberOfChecks >= maxNumberOfChecks) {
            throw new Error('Timeout error: Some docker services failed to start.')
        }
        await sleep(intervalBetweenChecks)
        status = await healthCheck.run()
        numberOfChecks++
        console.log(status)
    } while (
        !status
            // @ts-ignore
            .map(s => {
                return s.healthy
            })
            .reduce((prev: any, current: any) => {
                return prev && current
            })
        )
}
