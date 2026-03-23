# Changelog

## [0.13.0](https://github.com/ziyilam3999/hive-mind/compare/v0.12.2...v0.13.0) (2026-03-23)


### Features

* add evidence-gating, regression tracking, critique log to SPEC pipeline ([#56](https://github.com/ziyilam3999/hive-mind/issues/56)) ([07b35b6](https://github.com/ziyilam3999/hive-mind/commit/07b35b6153afa1e59cefb39ad9cf997580c0e339))
* add exitCode property to HiveMindError ([23b3273](https://github.com/ziyilam3999/hive-mind/commit/23b3273e6f04c4b3fb923d5ecc85a559bfc4b769))
* add exitCode property to HiveMindError ([6599f63](https://github.com/ziyilam3999/hive-mind/commit/6599f6326060ae4dd5e4f7e0718e27b3cc8f2968))
* add live summary report with progress dashboard and infographics ([#66](https://github.com/ziyilam3999/hive-mind/issues/66)) ([5efddd8](https://github.com/ziyilam3999/hive-mind/commit/5efddd805ea7d3674959729f2c948a2c18d50f33))
* add NORMALIZE compliant-format detection for /prd-generated PRDs ([#64](https://github.com/ziyilam3999/hive-mind/issues/64)) ([3097c9d](https://github.com/ziyilam3999/hive-mind/commit/3097c9d78737d64bc68d64de18de01875c44235f))
* add normalize stage to pipeline ([621811f](https://github.com/ziyilam3999/hive-mind/commit/621811ff2e0c157aa04e65a769863978a85b1f28))
* add output file polling with early process termination ([8ba790d](https://github.com/ziyilam3999/hive-mind/commit/8ba790d9644d88b667cb33e1b78510301c6e3c83))
* add scorecard agent for stage-aware pipeline report card ([cb7c7ce](https://github.com/ziyilam3999/hive-mind/commit/cb7c7cec279225f83cfa8f1e0068ca0af3ee93f9))
* add scorecard agent for stage-aware pipeline report card ([ca42854](https://github.com/ziyilam3999/hive-mind/commit/ca42854ae28af5328b891dce369b003161633f46))
* add timing/polling observability with test coverage ([af74c40](https://github.com/ziyilam3999/hive-mind/commit/af74c40f405f718afda3920809d8997a66a918bf))
* add timing/polling observability with test coverage ([b9b56b8](https://github.com/ziyilam3999/hive-mind/commit/b9b56b80040ea4e616653817bee8f5e3e99ec780))
* codebase-aware spec pipeline ([19e61be](https://github.com/ziyilam3999/hive-mind/commit/19e61be83a7e79469eacb4374afc406f636fd79c))
* codebase-aware spec pipeline with 4 new agent types ([5807a4e](https://github.com/ziyilam3999/hive-mind/commit/5807a4e763ba3e321a333449d519c33cc80eb005))
* **ENH-03:** parallel story execution with wave-based concurrency ([0a66d3a](https://github.com/ziyilam3999/hive-mind/commit/0a66d3a25cac20636db102f4998c75c224fb7b30))
* **ENH-17/18:** compliance reviewer + fixer agents with ENH-03 gap fixes ([6d41f7a](https://github.com/ziyilam3999/hive-mind/commit/6d41f7af736cd09e7e5d7ff42681e99c35ea9231))
* enhance /prd skill with gstack product diagnostic + double-critique reports ([#63](https://github.com/ziyilam3999/hive-mind/issues/63)) ([362d1c0](https://github.com/ziyilam3999/hive-mind/commit/362d1c079f90e00ab1a1b42d2ea1f465fd2f9b9e))
* **FW-01:** remove SIZE-BOUND gate, dogfood validated ([1497107](https://github.com/ziyilam3999/hive-mind/commit/149710752309a8f86b54d5026474281d2e529a95))
* **FW-01:** sub-task decomposition for high-complexity stories ([b343b19](https://github.com/ziyilam3999/hive-mind/commit/b343b19d6cf25b29916a3bc307c4b318b8a7684a))
* **FW-01:** sub-task decomposition for high-complexity stories ([77a744d](https://github.com/ziyilam3999/hive-mind/commit/77a744dc361b5484056bc7b9e0ae99ac89aa52cc))
* implement MVP Phase 1 — config file support + spawner upgrade ([3ad7bc3](https://github.com/ziyilam3999/hive-mind/commit/3ad7bc3a79aab21d49d779e771a7cc908a38269c))
* implement MVP Phase 2 — reliability (backoff, structured output, error recovery) ([98d7cb2](https://github.com/ziyilam3999/hive-mind/commit/98d7cb27fae507cb9a7ec2392fea302204288f47))
* implement Phase 3 — Visibility & DX (6 items) ([23aee9a](https://github.com/ziyilam3999/hive-mind/commit/23aee9a9349c38ab7b3e457046793cb057cca39f))
* implement Phase 4 — Pipeline Quality (synthesizer split, code-reviewer, log-summarizer, role-report feedback) ([6d8ea67](https://github.com/ziyilam3999/hive-mind/commit/6d8ea6727fa165da7a8698b25bf0e426c16a1db5))
* initial hive-mind v3 scaffold (US-01..US-09) ([302de13](https://github.com/ziyilam3999/hive-mind/commit/302de13dbc3e4c7a4111b8b2fb29c18ff8254bf5))
* output file polling with early process termination ([1da492f](https://github.com/ziyilam3999/hive-mind/commit/1da492fcbd40e3779620e3525a7845d2272f53c5))
* persist budget across checkpoints and add --greenfield flag ([647044f](https://github.com/ziyilam3999/hive-mind/commit/647044fa5e2843550e4cccbe54051264af67095b))
* Phase 3 reimplementation (RD-09, RD-08, ENH-01) ([26bdbc8](https://github.com/ziyilam3999/hive-mind/commit/26bdbc8653b57eb6df5ecf68616e1dd780f8b4e1))
* **Phase 6:** multi-repo module support + compliance gate workflow ([23a9aca](https://github.com/ziyilam3999/hive-mind/commit/23a9acaaee4e52a459a2ce158367fb766e473484))
* pipeline hardening for e2e execution (BUILD retry, pre-flight, early gate, registry enforcement) ([#61](https://github.com/ziyilam3999/hive-mind/issues/61)) ([a50fc51](https://github.com/ziyilam3999/hive-mind/commit/a50fc514020da9006028ebfc3cbbf3f8aedfafec))
* register 6 Phase 4 agent types + role-report mapping (Phase 4, Step 1) ([32c1c5d](https://github.com/ziyilam3999/hive-mind/commit/32c1c5d8236c50f5040bc32d216da9532298722e))
* spec-stage improvements and new test utilities ([d286474](https://github.com/ziyilam3999/hive-mind/commit/d28647425760d1b35517ec2013a4f92141b7e800))
* **US-01:** Type definitions — CaseType and CaseOptions ([f7d694e](https://github.com/ziyilam3999/hive-mind/commit/f7d694e23f8d468938357c19b14155e8318065b2))
* **US-02:** String truncation with suffix ([ba000c0](https://github.com/ziyilam3999/hive-mind/commit/ba000c0b5f5f377a5e59ad6467aab29fd70abaef))
* **US-04:** Case conversion with two-phase tokenization ([d9360b6](https://github.com/ziyilam3999/hive-mind/commit/d9360b6af774ce69f89e0cf385df585b555a2e18))
* **US-10..US-16:** Wave 4 — SPEC, tooling, PLAN, BUILD, VERIFY, COMMIT, LEARN stages ([16a6b21](https://github.com/ziyilam3999/hive-mind/commit/16a6b21d19e94a557b8e86014140c61e6c051c3c))
* **US-17:** Wave 5 — REPORT stage with consolidated report, retrospective, and graduation ([f07c125](https://github.com/ziyilam3999/hive-mind/commit/f07c125b78ef3220432b4620b84557027c103432))


### Bug Fixes

* add missing getSpawnClaudeInvocationCount to pipeline-smoke mock ([b34f73e](https://github.com/ziyilam3999/hive-mind/commit/b34f73ed423682a1e0fb43f6d336a0b19dde3e3e))
* add missing updateLiveReport calls in feedback re-run paths ([#71](https://github.com/ziyilam3999/hive-mind/issues/71)) ([45281b7](https://github.com/ziyilam3999/hive-mind/commit/45281b7f0b6306dc0f71e87b9c7e255f91c7458c))
* add plan-validator agent, refactor salvage, artifact preservation ([#51](https://github.com/ziyilam3999/hive-mind/issues/51)) ([7be11a6](https://github.com/ziyilam3999/hive-mind/commit/7be11a60d06cc9eefabb0af323806cf44b9aa6f4))
* add refactorer scope rules, enforce max-5 rule limit, surface uncommitted stories ([#47](https://github.com/ziyilam3999/hive-mind/issues/47)) ([3cbc19f](https://github.com/ziyilam3999/hive-mind/commit/3cbc19f86dfff29d3aa17b7bd2ed759352336f51))
* add Write tool to all agents + pipe prompt via stdin on Windows ([926a6b5](https://github.com/ziyilam3999/hive-mind/commit/926a6b5af2a811da5839dceff3532b0a793486c7))
* baseline check resilience, checkpoint lifecycle, and workspace cleanup agent ([08aedfe](https://github.com/ziyilam3999/hive-mind/commit/08aedfe3855d562a7f47ffebfd75b5ca875ebc6e))
* Bug 13 — scope parseImplReport to FILES CREATED section + quote git add paths ([95322ed](https://github.com/ziyilam3999/hive-mind/commit/95322ed1fff052ae022370c9a88d3e256ed5c61a))
* bug-fix pipeline improvements and Phase 2 feature updates ([ff95469](https://github.com/ziyilam3999/hive-mind/commit/ff95469e25a98f23236a9c87bc351e8eb27f9e91))
* **ci:** add id-token permission for OAuth OIDC exchange ([6128499](https://github.com/ziyilam3999/hive-mind/commit/6128499ee73038774cf74c7e5d5ec686fce3ffb4))
* **ci:** add Write permission and remove show_full_output debug flag ([44c5309](https://github.com/ziyilam3999/hive-mind/commit/44c53095289d761fa0bf5fc6a04965664974eec7))
* **ci:** add Write permission to code review action ([6297051](https://github.com/ziyilam3999/hive-mind/commit/62970516d62a6b26de531fc8eb157743d4c964a2))
* **ci:** allow gh CLI commands in code review action ([00ffe7e](https://github.com/ziyilam3999/hive-mind/commit/00ffe7e67457076658503aef5f78de680c39f98a))
* **ci:** allow gh CLI commands in code review action ([68f615b](https://github.com/ziyilam3999/hive-mind/commit/68f615b4bae3445a105b36225eb45e9629940906))
* **ci:** enable full output for code review debugging ([40a5e40](https://github.com/ziyilam3999/hive-mind/commit/40a5e40f53be6fbe6ccf2152148a007f3a73e693))
* **ci:** enable show_full_output for code review debugging ([dfcf15d](https://github.com/ziyilam3999/hive-mind/commit/dfcf15d91971977a55e6a3e7b390a025ab9be8c1))
* **ci:** increase code review max-turns from 5 to 10 ([a1c5a2d](https://github.com/ziyilam3999/hive-mind/commit/a1c5a2d4b084c4fc139d6cc1b36b1d726caa6a7e))
* **ci:** increase code review max-turns to 10 ([6de1d2f](https://github.com/ziyilam3999/hive-mind/commit/6de1d2f5a8cff36f782abd20aedbd97bca6f486e))
* **ci:** instruct Claude to post review as PR comment ([491f56b](https://github.com/ziyilam3999/hive-mind/commit/491f56bff882c3f19f54f7a6746424c8c4ccf289))
* **ci:** instruct Claude to post review as PR comment via gh CLI ([357a50d](https://github.com/ziyilam3999/hive-mind/commit/357a50dd850f34531757bd90fe6de04565e7ffb4))
* **ci:** pass github_token explicitly for PR comment posting ([7e36581](https://github.com/ziyilam3999/hive-mind/commit/7e365813e7e1c0d47bed7a6d27a2cb2c9ebf39f7))
* **ci:** pass github_token for PR comment posting ([6672437](https://github.com/ziyilam3999/hive-mind/commit/6672437b68fd4309b52ec36cffab8967b5543225))
* **ci:** use --body-file for PR comment to avoid newline security block ([7a69c9b](https://github.com/ziyilam3999/hive-mind/commit/7a69c9b6ef9268842a2a4fb725fbf28dce21a9d4))
* **ci:** use --body-file for PR review comment posting ([f393756](https://github.com/ziyilam3999/hive-mind/commit/f3937565da9237c17ce6e1e1cd74f3fdfbea625c))
* **ci:** use settings input for tool permissions ([aa6f4c7](https://github.com/ziyilam3999/hive-mind/commit/aa6f4c724bf6fd82a39f1ac6eb620e1952d7091a))
* **ci:** use settings input for tool permissions in code review ([4325ec1](https://github.com/ziyilam3999/hive-mind/commit/4325ec10725cd5b55908621b946084dc6911d2b1))
* cwd fallback for single-repo projects ([#40](https://github.com/ziyilam3999/hive-mind/issues/40)) ([f7dc756](https://github.com/ziyilam3999/hive-mind/commit/f7dc756227f813944f5a3d10f665dbf067388f03))
* E2E bugs 1-12 for run-03 readiness ([f14acdf](https://github.com/ziyilam3999/hive-mind/commit/f14acdfcb5fe25640305e5b09fe07a81f4b4e535))
* honor stopAfterPlan on approve-spec resume and wire cost tracking ([05db9b6](https://github.com/ziyilam3999/hive-mind/commit/05db9b67fb38493eb38bbfca3000e8fb172f9810))
* include stage name in feedback re-run message ([#72](https://github.com/ziyilam3999/hive-mind/issues/72)) ([#75](https://github.com/ziyilam3999/hive-mind/issues/75)) ([4c2fb96](https://github.com/ziyilam3999/hive-mind/commit/4c2fb96e2aacd78d3526e1998dc572d01d55c7a6))
* inject authoritative status summary into reporter agent ([#45](https://github.com/ziyilam3999/hive-mind/issues/45)) ([7bd6f56](https://github.com/ziyilam3999/hive-mind/commit/7bd6f562ec3d7d96022f6ae41b0b20dac5bc03e7))
* **K5:** add post-fix verification gate + always-diagnose before fixer ([444f49d](https://github.com/ziyilam3999/hive-mind/commit/444f49d5ab03b29c9143f1df0c545e7f4366f6be))
* normalize Windows paths in agent prompts + thread moduleCwd to compliance (K13-K17) ([fbc62e3](https://github.com/ziyilam3999/hive-mind/commit/fbc62e385346fbdf480273cf3bf97dbf7461b56b))
* parse CLI array JSON for real cost data + skip redundant report archives ([5ae476b](https://github.com/ziyilam3999/hive-mind/commit/5ae476b668d6bb7d4521cf39fdd1ec7cbdd577c9))
* **parser:** expand inline status match to accept Result/Verdict/Outcome synonyms (Bug 14) ([67f8fd6](https://github.com/ziyilam3999/hive-mind/commit/67f8fd6460df6cab2cb7c31729cd474db9dc3b9b))
* pipeline reliability gates from monday-bot failure analysis ([#37](https://github.com/ziyilam3999/hive-mind/issues/37)) ([0686151](https://github.com/ziyilam3999/hive-mind/commit/068615182c5f1fecadd3a6a289baa4e1caae77a6))
* pipeline reliability improvements from 32-story monday-bot run ([c87143b](https://github.com/ziyilam3999/hive-mind/commit/c87143beb2ed71e50b542da64d8f039b34220ee2))
* resolve K1-K4 known issues from Phase 4 Tier 3 dogfood ([2921b79](https://github.com/ziyilam3999/hive-mind/commit/2921b79533b99f0905744cd517d02a932a772400))
* route agent temp scripts to scratch dir instead of workspace root (K18) ([5478421](https://github.com/ziyilam3999/hive-mind/commit/5478421a8b921cb0308f28f8a0fa46708454382c))
* unify break to return in NORMALIZE feedback path ([#73](https://github.com/ziyilam3999/hive-mind/issues/73)) ([#76](https://github.com/ziyilam3999/hive-mind/issues/76)) ([9fc4a90](https://github.com/ziyilam3999/hive-mind/commit/9fc4a907d4253d058797bc8bc4fc5c50e7fcb03d))
* wire module parsing into pipeline + dogfood fixes (K8-K12) ([691651e](https://github.com/ziyilam3999/hive-mind/commit/691651efeb155878b9b3bcdca0b9a3c93b5b4270))


### Reverts

* remove unused exitCode from HiveMindError ([2b414fc](https://github.com/ziyilam3999/hive-mind/commit/2b414fc9af592817727e0185952806c28f85df34))

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
