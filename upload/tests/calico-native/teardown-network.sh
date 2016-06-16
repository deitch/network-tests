#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

# remove the calico network
hostname=$(hostname)
devtype=${hostname%%[0-9]*}

# only remove the network once, on the source
if docker network ls | grep -wq calico; then
	docker network rm calico || true
fi
calicoctl node stop
calicoctl node remove


