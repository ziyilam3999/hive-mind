## [0.18.2](https://github.com/ziyilam3999/hive-mind/compare/v0.18.1...v0.18.2) (2026-03-29)

### Bug Fixes

* reuse previous dashboard port to avoid opening new browser tabs (#157)
* specify ISO-8601 timestamp format in Story 7 (#147) (#156)
* add stable IDs to backlog items (#145) (#155)

## [0.18.1](https://github.com/ziyilam3999/hive-mind/compare/v0.18.0...v0.18.1) (2026-03-28)

### Bug Fixes

* address PR #153 code review comments (#154)

## [0.18.0](https://github.com/ziyilam3999/hive-mind/compare/v0.17.5...v0.18.0) (2026-03-28)

### Features

* consolidate 5-file agent type registry into single file (#153)

## [0.17.5](https://github.com/ziyilam3999/hive-mind/compare/v0.17.4...v0.17.5) (2026-03-28)

### Bug Fixes

* clean stale working directory before new pipeline run (#151)

## [0.17.4](https://github.com/ziyilam3999/hive-mind/compare/v0.17.3...v0.17.4) (2026-03-28)

### Bug Fixes

* prevent dashboard from opening multiple browser tabs across CLI commands (#150)

## [0.17.3](https://github.com/ziyilam3999/hive-mind/compare/v0.17.2...v0.17.3) (2026-03-27)

### Documentation

* add 8 new ideas to harness roadmap (baseline, simplicity, workspace cleanup, backlog) (#144)

## [0.17.2](https://github.com/ziyilam3999/hive-mind/compare/v0.17.1...v0.17.2) (2026-03-27)

### Documentation

* add double-critique effectiveness and retrospective reports (R11R, R12) (#142)
* fix R1 plan to match codebase reality (#141)
* split PLAN stage timeout into decomposition + AC/EC gen (#140)
* replace fixed 4hr timeout with dynamic rolling-average (#139)
* add design principles to harness roadmap (#138)
* add harness roadmap release plan and R1 detailed plan (#137)
* reorganize harness improvement roadmap (#136)
* add improvement roadmap Parts 2-4 (#133)

### Bug Fixes

* use nullish coalescing for story.wave to handle wave 0 (#134)
* scope tsc to story files, add checkpoint resume, enable incremental (#132)
* improve usage-limit detection and guard spawner rejections (#127)
* treat deleted source files as verification failure (#128)
* replace string-matching with typed BuildPipelineError (#126)

### Miscellaneous

* bundle dashboard JS with esbuild to eliminate dual-copy (#135)
* extract writeReportAndCheckpoint helper (#131)

## [0.17.1](https://github.com/ziyilam3999/hive-mind/compare/v0.17.0...v0.17.1) (2026-03-26)

### Miscellaneous

* extract deriveActiveAgents and add 31 unit tests (#125)
* add harness comparison and improvement roadmap (#123)
* update README to reflect v0.16.0 features and capabilities (#123)

## [0.17.0](https://github.com/ziyilam3999/hive-mind/compare/v0.16.0...v0.17.0) (2026-03-25)

### Features

* **dashboard:** enhance swarm panel with subtask IDs, descriptions, and shimmer (#124)

### Bug Fixes

* generalize WAVE_START fallback into STAGE_DEFS with tests (#122)
* add paused visual state for checkpoint-gated stages (#121)
* add context-specific messages to all notifyCheckpoint call sites (#120)
* consolidate managerLog scan passes in deriveActiveAgents (#118)
* deriveActiveAgents returns structured object (#117)
* capture Date.now() once per render pass in dashboard (#116)
* simplify checkpoint banner left indicator (#115)
* guard against NaN in checkpoint banner elapsed time (#114)
* guard against negative elapsed time in swarm activity (#113)

### Miscellaneous

* update README to reflect v0.16.0 capabilities (#119)
* remove release-please GitHub Action (#112)

# Changelog

## [0.16.0](https://github.com/ziyilam3999/hive-mind/compare/v0.15.2...v0.16.0) (2026-03-24)


### Features

* usage limit detection and REPORT stage validation ([#107](https://github.com/ziyilam3999/hive-mind/issues/107)) ([409072b](https://github.com/ziyilam3999/hive-mind/commit/409072b9d61160b1d36cdbe736b41406e7e9e996))

## [0.15.2](https://github.com/ziyilam3999/hive-mind/compare/v0.15.1...v0.15.2) (2026-03-24)


### Bug Fixes

* accurate stage timing and story elapsed display ([#103](https://github.com/ziyilam3999/hive-mind/issues/103)) ([2fd062f](https://github.com/ziyilam3999/hive-mind/commit/2fd062f57b28a1094e092183b3d31539868a218e))

## [0.15.1](https://github.com/ziyilam3999/hive-mind/compare/v0.15.0...v0.15.1) (2026-03-24)


### Bug Fixes

* **dashboard:** smooth banner animation + correct stage timing at checkpoints ([#100](https://github.com/ziyilam3999/hive-mind/issues/100)) ([a02510f](https://github.com/ziyilam3999/hive-mind/commit/a02510fa72ab64c622896c406fc14a1c1c1a048e))

## [0.15.0](https://github.com/ziyilam3999/hive-mind/compare/v0.14.0...v0.15.0) (2026-03-24)


### Features

* three-layer checkpoint notification system ([#95](https://github.com/ziyilam3999/hive-mind/issues/95)) ([cdcf05a](https://github.com/ziyilam3999/hive-mind/commit/cdcf05acbadcdf7beff4945f688c9880579ab65b))


### Bug Fixes

* prevent command injection in notify.ts ([08bd9a9](https://github.com/ziyilam3999/hive-mind/commit/08bd9a9752f0fb6fe8a6a8e92d70bf0f760f79ba))

## [0.14.0](https://github.com/ziyilam3999/hive-mind/compare/v0.13.3...v0.14.0) (2026-03-24)


### Features

* **dashboard:** add Swarm Activity panel showing active agents ([#90](https://github.com/ziyilam3999/hive-mind/issues/90)) ([bd4ec44](https://github.com/ziyilam3999/hive-mind/commit/bd4ec44e5273da7a523722cf3e4076f79ff32229))

## [0.13.3](https://github.com/ziyilam3999/hive-mind/compare/v0.13.2...v0.13.3) (2026-03-24)


### Bug Fixes

* skip dashboard startup when one is already running ([54f814f](https://github.com/ziyilam3999/hive-mind/commit/54f814f3ada9474d464c690f5485a147c13475ef))
* skip dashboard startup when one is already running ([0c09744](https://github.com/ziyilam3999/hive-mind/commit/0c0974406f297cb1980e5327bcba155a7b5fbe9f))

## [0.13.2](https://github.com/ziyilam3999/hive-mind/compare/v0.13.1...v0.13.2) (2026-03-23)


### Bug Fixes

* keep dashboard alive when pipeline pauses at checkpoint ([4ff86e3](https://github.com/ziyilam3999/hive-mind/commit/4ff86e34359fb1c412216930b8aa79b3f0729459))
* keep dashboard alive when pipeline pauses at checkpoint ([bfeb305](https://github.com/ziyilam3999/hive-mind/commit/bfeb305ff17f29106251db168f5637271f5f410f))

## [0.13.1](https://github.com/ziyilam3999/hive-mind/compare/v0.13.0...v0.13.1) (2026-03-23)


### Bug Fixes

* keep dashboard alive across checkpoint pauses ([0a81214](https://github.com/ziyilam3999/hive-mind/commit/0a81214b9ca60cc3df395ee49b02572f65115b2f))
* keep dashboard alive across checkpoint pauses ([21be06b](https://github.com/ziyilam3999/hive-mind/commit/21be06b963faf67e336b5c2dde79255655009bca))

## [0.13.0](https://github.com/ziyilam3999/hive-mind/compare/v0.12.2...v0.13.0) (2026-03-23)


### Features

* **dashboard:** notebook-style UI with fixed port ([#79](https://github.com/ziyilam3999/hive-mind/issues/79)) ([4e169d6](https://github.com/ziyilam3999/hive-mind/commit/4e169d6fc33512071da262bb19d180db4edbcd6e))

## [0.12.2](https://github.com/ziyilam3999/hive-mind/compare/v0.12.1...v0.12.2) (2026-03-23)


### Bug Fixes

* include stage name in feedback re-run message ([#72](https://github.com/ziyilam3999/hive-mind/issues/72)) ([#75](https://github.com/ziyilam3999/hive-mind/issues/75)) ([4c2fb96](https://github.com/ziyilam3999/hive-mind/commit/4c2fb96e2aacd78d3526e1998dc572d01d55c7a6))
* unify break to return in NORMALIZE feedback path ([#73](https://github.com/ziyilam3999/hive-mind/issues/73)) ([#76](https://github.com/ziyilam3999/hive-mind/issues/76)) ([9fc4a90](https://github.com/ziyilam3999/hive-mind/commit/9fc4a907d4253d058797bc8bc4fc5c50e7fcb03d))

## [0.12.1](https://github.com/ziyilam3999/hive-mind/compare/v0.12.0...v0.12.1) (2026-03-22)


### Bug Fixes

* add missing updateLiveReport calls in feedback re-run paths ([#71](https://github.com/ziyilam3999/hive-mind/issues/71)) ([45281b7](https://github.com/ziyilam3999/hive-mind/commit/45281b7f0b6306dc0f71e87b9c7e255f91c7458c))

## [0.12.0](https://github.com/ziyilam3999/hive-mind/compare/v0.11.0...v0.12.0) (2026-03-22)


### Features

* add live summary report with progress dashboard and infographics ([#66](https://github.com/ziyilam3999/hive-mind/issues/66)) ([5efddd8](https://github.com/ziyilam3999/hive-mind/commit/5efddd805ea7d3674959729f2c948a2c18d50f33))

## [0.11.0](https://github.com/ziyilam3999/hive-mind/compare/v0.10.0...v0.11.0) (2026-03-22)


### Features

* add NORMALIZE compliant-format detection for /prd-generated PRDs ([#64](https://github.com/ziyilam3999/hive-mind/issues/64)) ([3097c9d](https://github.com/ziyilam3999/hive-mind/commit/3097c9d78737d64bc68d64de18de01875c44235f))

## [0.10.0](https://github.com/ziyilam3999/hive-mind/compare/v0.9.0...v0.10.0) (2026-03-22)


### Features

* enhance /prd skill with gstack product diagnostic + double-critique reports ([#63](https://github.com/ziyilam3999/hive-mind/issues/63)) ([362d1c0](https://github.com/ziyilam3999/hive-mind/commit/362d1c079f90e00ab1a1b42d2ea1f465fd2f9b9e))
* pipeline hardening for e2e execution (BUILD retry, pre-flight, early gate, registry enforcement) ([#61](https://github.com/ziyilam3999/hive-mind/issues/61)) ([a50fc51](https://github.com/ziyilam3999/hive-mind/commit/a50fc514020da9006028ebfc3cbbf3f8aedfafec))

## [0.9.0](https://github.com/ziyilam3999/hive-mind/compare/v0.8.13...v0.9.0) (2026-03-22)


### Features

* add evidence-gating, regression tracking, critique log to SPEC pipeline ([#56](https://github.com/ziyilam3999/hive-mind/issues/56)) ([07b35b6](https://github.com/ziyilam3999/hive-mind/commit/07b35b6153afa1e59cefb39ad9cf997580c0e339))

## [0.8.13](https://github.com/ziyilam3999/hive-mind/compare/v0.8.12...v0.8.13) (2026-03-22)


### Bug Fixes

* add plan-validator agent, refactor salvage, artifact preservation ([#51](https://github.com/ziyilam3999/hive-mind/issues/51)) ([7be11a6](https://github.com/ziyilam3999/hive-mind/commit/7be11a60d06cc9eefabb0af323806cf44b9aa6f4))

## [0.8.12](https://github.com/ziyilam3999/hive-mind/compare/v0.8.11...v0.8.12) (2026-03-22)


### Bug Fixes

* add refactorer scope rules, enforce max-5 rule limit, surface uncommitted stories ([#47](https://github.com/ziyilam3999/hive-mind/issues/47)) ([3cbc19f](https://github.com/ziyilam3999/hive-mind/commit/3cbc19f86dfff29d3aa17b7bd2ed759352336f51))

## [0.8.11](https://github.com/ziyilam3999/hive-mind/compare/v0.8.10...v0.8.11) (2026-03-21)


### Bug Fixes

* inject authoritative status summary into reporter agent ([#45](https://github.com/ziyilam3999/hive-mind/issues/45)) ([7bd6f56](https://github.com/ziyilam3999/hive-mind/commit/7bd6f562ec3d7d96022f6ae41b0b20dac5bc03e7))

## [0.8.10](https://github.com/ziyilam3999/hive-mind/compare/v0.8.9...v0.8.10) (2026-03-21)


### Bug Fixes

* cwd fallback for single-repo projects ([#40](https://github.com/ziyilam3999/hive-mind/issues/40)) ([f7dc756](https://github.com/ziyilam3999/hive-mind/commit/f7dc756227f813944f5a3d10f665dbf067388f03))

## [0.8.9](https://github.com/ziyilam3999/hive-mind/compare/v0.8.8...v0.8.9) (2026-03-21)


### Bug Fixes

* pipeline reliability gates from monday-bot failure analysis ([#37](https://github.com/ziyilam3999/hive-mind/issues/37)) ([0686151](https://github.com/ziyilam3999/hive-mind/commit/068615182c5f1fecadd3a6a289baa4e1caae77a6))

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
