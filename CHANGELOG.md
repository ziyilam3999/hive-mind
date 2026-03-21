# Changelog

## [0.8.8](https://github.com/ziyilam3999/hive-mind/compare/v0.8.7...v0.8.8) (2026-03-21)


### Bug Fixes

* **ci:** add Write permission and remove show_full_output debug flag ([44c5309](https://github.com/ziyilam3999/hive-mind/commit/44c53095289d761fa0bf5fc6a04965664974eec7))
* **ci:** add Write permission to code review action ([6297051](https://github.com/ziyilam3999/hive-mind/commit/62970516d62a6b26de531fc8eb157743d4c964a2))

## [0.8.7](https://github.com/ziyilam3999/hive-mind/compare/v0.8.6...v0.8.7) (2026-03-21)


### Bug Fixes

* **ci:** use --body-file for PR comment to avoid newline security block ([7a69c9b](https://github.com/ziyilam3999/hive-mind/commit/7a69c9b6ef9268842a2a4fb725fbf28dce21a9d4))
* **ci:** use --body-file for PR review comment posting ([f393756](https://github.com/ziyilam3999/hive-mind/commit/f3937565da9237c17ce6e1e1cd74f3fdfbea625c))

## [0.8.6](https://github.com/ziyilam3999/hive-mind/compare/v0.8.5...v0.8.6) (2026-03-20)


### Bug Fixes

* **ci:** use settings input for tool permissions ([aa6f4c7](https://github.com/ziyilam3999/hive-mind/commit/aa6f4c724bf6fd82a39f1ac6eb620e1952d7091a))
* **ci:** use settings input for tool permissions in code review ([4325ec1](https://github.com/ziyilam3999/hive-mind/commit/4325ec10725cd5b55908621b946084dc6911d2b1))

## [0.8.5](https://github.com/ziyilam3999/hive-mind/compare/v0.8.4...v0.8.5) (2026-03-20)


### Bug Fixes

* **ci:** allow gh CLI commands in code review action ([00ffe7e](https://github.com/ziyilam3999/hive-mind/commit/00ffe7e67457076658503aef5f78de680c39f98a))
* **ci:** allow gh CLI commands in code review action ([68f615b](https://github.com/ziyilam3999/hive-mind/commit/68f615b4bae3445a105b36225eb45e9629940906))

## [0.8.4](https://github.com/ziyilam3999/hive-mind/compare/v0.8.3...v0.8.4) (2026-03-20)


### Bug Fixes

* **ci:** instruct Claude to post review as PR comment ([491f56b](https://github.com/ziyilam3999/hive-mind/commit/491f56bff882c3f19f54f7a6746424c8c4ccf289))
* **ci:** instruct Claude to post review as PR comment via gh CLI ([357a50d](https://github.com/ziyilam3999/hive-mind/commit/357a50dd850f34531757bd90fe6de04565e7ffb4))

## [0.8.3](https://github.com/ziyilam3999/hive-mind/compare/v0.8.2...v0.8.3) (2026-03-20)


### Bug Fixes

* **ci:** pass github_token explicitly for PR comment posting ([7e36581](https://github.com/ziyilam3999/hive-mind/commit/7e365813e7e1c0d47bed7a6d27a2cb2c9ebf39f7))
* **ci:** pass github_token for PR comment posting ([6672437](https://github.com/ziyilam3999/hive-mind/commit/6672437b68fd4309b52ec36cffab8967b5543225))

## [0.8.2](https://github.com/ziyilam3999/hive-mind/compare/v0.8.1...v0.8.2) (2026-03-20)


### Bug Fixes

* **ci:** enable full output for code review debugging ([40a5e40](https://github.com/ziyilam3999/hive-mind/commit/40a5e40f53be6fbe6ccf2152148a007f3a73e693))
* **ci:** enable show_full_output for code review debugging ([dfcf15d](https://github.com/ziyilam3999/hive-mind/commit/dfcf15d91971977a55e6a3e7b390a025ab9be8c1))

## [0.8.1](https://github.com/ziyilam3999/hive-mind/compare/v0.8.0...v0.8.1) (2026-03-20)


### Reverts

* remove unused exitCode from HiveMindError ([2b414fc](https://github.com/ziyilam3999/hive-mind/commit/2b414fc9af592817727e0185952806c28f85df34))

## [0.8.0](https://github.com/ziyilam3999/hive-mind/compare/v0.7.2...v0.8.0) (2026-03-20)


### Features

* add exitCode property to HiveMindError ([23b3273](https://github.com/ziyilam3999/hive-mind/commit/23b3273e6f04c4b3fb923d5ecc85a559bfc4b769))
* add exitCode property to HiveMindError ([6599f63](https://github.com/ziyilam3999/hive-mind/commit/6599f6326060ae4dd5e4f7e0718e27b3cc8f2968))

## [0.7.2](https://github.com/ziyilam3999/hive-mind/compare/v0.7.1...v0.7.2) (2026-03-20)


### Bug Fixes

* **ci:** increase code review max-turns from 5 to 10 ([a1c5a2d](https://github.com/ziyilam3999/hive-mind/commit/a1c5a2d4b084c4fc139d6cc1b36b1d726caa6a7e))
* **ci:** increase code review max-turns to 10 ([6de1d2f](https://github.com/ziyilam3999/hive-mind/commit/6de1d2f5a8cff36f782abd20aedbd97bca6f486e))

## [0.7.1](https://github.com/ziyilam3999/hive-mind/compare/v0.7.0...v0.7.1) (2026-03-20)


### Bug Fixes

* **ci:** add id-token permission for OAuth OIDC exchange ([6128499](https://github.com/ziyilam3999/hive-mind/commit/6128499ee73038774cf74c7e5d5ec686fce3ffb4))

## [0.7.0](https://github.com/ziyilam3999/hive-mind/compare/v0.6.0...v0.7.0) (2026-03-20)


### Features

* add scorecard agent for stage-aware pipeline report card ([cb7c7ce](https://github.com/ziyilam3999/hive-mind/commit/cb7c7cec279225f83cfa8f1e0068ca0af3ee93f9))
* add scorecard agent for stage-aware pipeline report card ([ca42854](https://github.com/ziyilam3999/hive-mind/commit/ca42854ae28af5328b891dce369b003161633f46))

## [0.6.0](https://github.com/ziyilam3999/hive-mind/compare/v0.5.1...v0.6.0) (2026-03-20)


### Features

* codebase-aware spec pipeline ([19e61be](https://github.com/ziyilam3999/hive-mind/commit/19e61be83a7e79469eacb4374afc406f636fd79c))
* codebase-aware spec pipeline with 4 new agent types ([5807a4e](https://github.com/ziyilam3999/hive-mind/commit/5807a4e763ba3e321a333449d519c33cc80eb005))


### Bug Fixes

* add missing getSpawnClaudeInvocationCount to pipeline-smoke mock ([b34f73e](https://github.com/ziyilam3999/hive-mind/commit/b34f73ed423682a1e0fb43f6d336a0b19dde3e3e))
* pipeline reliability improvements from 32-story monday-bot run ([c87143b](https://github.com/ziyilam3999/hive-mind/commit/c87143beb2ed71e50b542da64d8f039b34220ee2))

## [0.5.1](https://github.com/ziyilam3999/hive-mind/compare/v0.5.0...v0.5.1) (2026-03-18)


### Bug Fixes

* honor stopAfterPlan on approve-spec resume and wire cost tracking ([05db9b6](https://github.com/ziyilam3999/hive-mind/commit/05db9b67fb38493eb38bbfca3000e8fb172f9810))

## [0.5.0](https://github.com/ziyilam3999/hive-mind/compare/v0.4.0...v0.5.0) (2026-03-18)


### Features

* add timing/polling observability with test coverage ([af74c40](https://github.com/ziyilam3999/hive-mind/commit/af74c40f405f718afda3920809d8997a66a918bf))

## [0.4.0](https://github.com/ziyilam3999/hive-mind/compare/v0.3.0...v0.4.0) (2026-03-18)


### Features

* add normalize stage to pipeline ([621811f](https://github.com/ziyilam3999/hive-mind/commit/621811ff2e0c157aa04e65a769863978a85b1f28))
* add output file polling with early process termination ([8ba790d](https://github.com/ziyilam3999/hive-mind/commit/8ba790d9644d88b667cb33e1b78510301c6e3c83))
* output file polling with early process termination ([1da492f](https://github.com/ziyilam3999/hive-mind/commit/1da492fcbd40e3779620e3525a7845d2272f53c5))
* persist budget across checkpoints and add --greenfield flag ([647044f](https://github.com/ziyilam3999/hive-mind/commit/647044fa5e2843550e4cccbe54051264af67095b))

## [0.3.0](https://github.com/ziyilam3999/hive-mind/compare/v0.2.0...v0.3.0) (2026-03-18)


### Features

* spec-stage improvements and new test utilities ([d286474](https://github.com/ziyilam3999/hive-mind/commit/d28647425760d1b35517ec2013a4f92141b7e800))


### Bug Fixes

* baseline check resilience, checkpoint lifecycle, and workspace cleanup agent ([08aedfe](https://github.com/ziyilam3999/hive-mind/commit/08aedfe3855d562a7f47ffebfd75b5ca875ebc6e))
