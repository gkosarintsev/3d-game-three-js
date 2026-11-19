Fix fast-check failure: rebuild registry levels 07-15 to match current chunk-member compiler

Self-heal for PR #38 (work-in-progress R5.5): node / fast checks failed on committed-brief parity for levels 07/08/09/10/15 (chunk member records now carry homeChunk/coverageChunks). Regenerated level-07/08/09/10/15 catalogs deterministically (0 warnings) with the same code path as level-16..22. Pushing to update the branch and re-run CI.
