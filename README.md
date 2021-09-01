# Integration test

[![Daily Test](https://github.com/AMPnet/integration-test-eth/actions/workflows/daily-test.yml/badge.svg?branch=master)](https://github.com/AMPnet/integration-test-eth/actions/workflows/daily-test.yml)

Repo for integration tests for AMPnet crowdfunding project on EVM.

## Usage

To start the test run following:

```shell
npm run test
```

## Service

Test will start following services in docker compose:

* identity-service
* report-service
* Postgres database
* Hardhat
