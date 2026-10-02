.DEFAULT_GOAL := ci
.NOTPARALLEL:

TARGETS := ci ci-install ci-policies ci-lint ci-format ci-types ci-test ci-scripts ci-dead-code ci-audit ci-workflows ci-secrets ci-build ci-integration ci-smoke ci-react ci-tools help
GOALS := $(if $(MAKECMDGOALS),$(MAKECMDGOALS),ci)

ifeq ($(CI_RESOURCE_GATE_ACTIVE)$(GITHUB_ACTIONS),)
.PHONY: $(TARGETS) dispatch
$(TARGETS): dispatch

dispatch:
	@python3 -B scripts/resource-gate.py exec --goals $(GOALS) -- $(MAKE) CI_RESOURCE_GATE_ACTIVE=1 $(GOALS)
else
.PHONY: $(TARGETS)
ci: ci-install ci-policies ci-lint ci-format ci-types ci-test ci-scripts ci-dead-code ci-audit ci-workflows ci-secrets ci-build ci-integration ci-smoke ci-react

$(filter-out ci,$(TARGETS)):
	@bun scripts/ci.mjs $@
endif
